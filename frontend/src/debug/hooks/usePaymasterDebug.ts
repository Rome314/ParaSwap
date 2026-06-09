import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { aaConfig } from '../../lib/aa/config';
import { env } from '../../config/env';
import { PAYMASTER_ABI, A7A5_NATIVE_ORACLE_ABI, USDT_NATIVE_ORACLE_ABI } from '../../lib/aa/abis';
import { formatTokenAmount, stalenessCountdown } from '../../lib/aa/decode';
import { estimateUserOperationGas } from '../../lib/aa/bundler';
import { buildUserOp, ENTRYPOINT_ABI } from '../../lib/aa/userOp';

export interface PaymasterSnapshot {
  address: string;
  label: string;
  deposit: bigint;
  entryPointBalance: bigint;
  paused: boolean;
  oracle: string;
  token: string;
  tokenPrice?: bigint;
  validUntil?: bigint;
  staleness?: string;
}

export function usePaymasterDebug(sender?: string | null) {
  const [snapshots, setSnapshots] = useState<PaymasterSnapshot[]>([]);
  const [quote, setQuote] = useState<Record<string, string> | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
    const paymasters = [
      { label: 'A7A5', address: aaConfig.a7a5Paymaster, oracleAbi: A7A5_NATIVE_ORACLE_ABI },
      { label: 'USDT', address: aaConfig.usdtPaymaster, oracleAbi: USDT_NATIVE_ORACLE_ABI },
    ].filter((p) => p.address);

    const results: PaymasterSnapshot[] = [];
    for (const pm of paymasters) {
      const contract = new Contract(pm.address, PAYMASTER_ABI, provider);
      const [deposit, entryPointBalance, paused, oracle, token] = await Promise.all([
        contract.getDeposit() as Promise<bigint>,
        contract.entryPointBalance() as Promise<bigint>,
        contract.paused() as Promise<boolean>,
        contract.oracle() as Promise<string>,
        contract.token() as Promise<string>,
      ]);

      let tokenPrice: bigint | undefined;
      let validUntil: bigint | undefined;
      if (oracle && oracle !== '0x0000000000000000000000000000000000000000') {
        const oracleContract = new Contract(oracle, pm.oracleAbi, provider);
        const data = (await oracleContract.tokenPriceData()) as [bigint, bigint];
        tokenPrice = data[0];
        validUntil = data[1];
      }

      results.push({
        address: pm.address,
        label: pm.label,
        deposit,
        entryPointBalance,
        paused,
        oracle,
        token,
        tokenPrice,
        validUntil,
        staleness: validUntil !== undefined ? stalenessCountdown(validUntil) : undefined,
      });
    }
    setSnapshots(results);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const simulateQuote = useCallback(
    async (gasToken: 'a7a5' | 'usdt') => {
      if (!sender) {
        setQuoteError('Smart account address required');
        return;
      }
      setLoading(true);
      setQuoteError(null);
      try {
        const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
        const entryPoint = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
        const op = await buildUserOp(
          provider,
          {
            getNonce: (s, k) => entryPoint.getNonce(s, k) as Promise<bigint>,
          },
          { sender, callData: '0x', gasToken },
        );
        const estimate = await estimateUserOperationGas(op);
        setQuote(estimate);
        return estimate;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setQuoteError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [sender],
  );

  const formatPmRow = (snap: PaymasterSnapshot) => ({
    ...snap,
    depositEth: formatTokenAmount(snap.deposit, 18, 'ETH'),
    epBalanceEth: formatTokenAmount(snap.entryPointBalance, 18, 'ETH'),
    priceLabel: snap.tokenPrice !== undefined ? snap.tokenPrice.toString() : '—',
  });

  return {
    snapshots: snapshots.map(formatPmRow),
    refresh,
    simulateQuote,
    quote,
    quoteError,
    loading,
  };
}
