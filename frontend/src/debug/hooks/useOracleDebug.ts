import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { aaConfig } from '../../lib/aa/config';
import { env } from '../../config/env';
import {
  TWAP_ORACLE_ABI,
  A7A5_NATIVE_ORACLE_ABI,
  USDT_NATIVE_ORACLE_ABI,
  CHAINLINK_ABI,
  V3_POOL_ABI,
} from '../../lib/aa/abis';
import { formatPriceFromChainlink, stalenessCountdown } from '../../lib/aa/decode';

export interface OracleFeedSnapshot {
  id: string;
  label: string;
  address: string;
  price?: string;
  validUntil?: string;
  maxStaleness?: string;
  twapWindow?: number;
  pool?: string;
  observationCardinality?: number;
  updatedAt?: number;
  warmup?: string;
  extra?: Record<string, string>;
}

export function useOracleDebug() {
  const [feeds, setFeeds] = useState<OracleFeedSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
      const out: OracleFeedSnapshot[] = [];

      if (aaConfig.a7a5TwapOracle) {
        const twap = new Contract(aaConfig.a7a5TwapOracle, TWAP_ORACLE_ABI, provider);
        const [, answer, , updatedAt] = (await twap.latestRoundData()) as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const decimals = (await twap.decimals()) as number;
        const twapWindow = Number(await twap.twapWindow());
        const pool = (await twap.POOL()) as string;

        let observationCardinality = 0;
        let warmup = 'unknown';
        try {
          const poolContract = new Contract(pool, V3_POOL_ABI, provider);
          const slot0 = await poolContract.slot0();
          observationCardinality = Number(slot0.observationCardinality);
          const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
          warmup =
            observationCardinality < 2
              ? 'cold — need more observations'
              : age > twapWindow
                ? 'stale TWAP window'
                : 'warm';
        } catch {
          warmup = 'pool read failed';
        }

        out.push({
          id: 'twap',
          label: 'A7A5/USDT TWAP',
          address: aaConfig.a7a5TwapOracle,
          price: formatPriceFromChainlink(answer, decimals),
          twapWindow,
          pool,
          observationCardinality,
          updatedAt: Number(updatedAt),
          warmup,
        });
      }

      if (aaConfig.a7a5NativeOracle) {
        const oracle = new Contract(aaConfig.a7a5NativeOracle, A7A5_NATIVE_ORACLE_ABI, provider);
        const [price, validUntil] = (await oracle.tokenPriceData()) as [bigint, bigint];
        const maxStaleness = (await oracle.maxStaleness()) as bigint;
        out.push({
          id: 'a7a5-native',
          label: 'A7A5 Native Oracle',
          address: aaConfig.a7a5NativeOracle,
          price: price.toString(),
          validUntil: stalenessCountdown(validUntil),
          maxStaleness: `${Number(maxStaleness)}s`,
        });
      }

      if (aaConfig.usdtNativeOracle) {
        const oracle = new Contract(aaConfig.usdtNativeOracle, USDT_NATIVE_ORACLE_ABI, provider);
        const [price, validUntil] = (await oracle.tokenPriceData()) as [bigint, bigint];
        const maxStaleness = (await oracle.maxStaleness()) as bigint;
        out.push({
          id: 'usdt-native',
          label: 'USDT Native Oracle',
          address: aaConfig.usdtNativeOracle,
          price: price.toString(),
          validUntil: stalenessCountdown(validUntil),
          maxStaleness: `${Number(maxStaleness)}s`,
        });
      }

      if (aaConfig.chainlinkUsdtEth) {
        const cl = new Contract(aaConfig.chainlinkUsdtEth, CHAINLINK_ABI, provider);
        const [, answer, , updatedAt] = (await cl.latestRoundData()) as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const decimals = (await cl.decimals()) as number;
        out.push({
          id: 'chainlink-usdt-eth',
          label: 'Chainlink USDT/ETH (reference)',
          address: aaConfig.chainlinkUsdtEth,
          price: formatPriceFromChainlink(answer, decimals),
          updatedAt: Number(updatedAt),
          extra: { note: 'ETH per USDT — cross-check native oracles' },
        });
      }

      setFeeds(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { feeds, loading, error, refresh };
}
