import { useCallback, useEffect, useState } from 'react';
import { JsonRpcProvider } from 'ethers';
import { aaConfig } from '../../lib/aa/config';
import { env } from '../../config/env';
import { ENTRYPOINT_EXTENDED_ABI } from '../../lib/aa/abis';
import { Contract } from 'ethers';

export interface ForkDeployAddresses {
  entryPoint?: string;
  paraSwap?: string;
  poolsFacade?: string;
  a7a5Paymaster?: string;
  usdtPaymaster?: string;
  accountFactory?: string;
  accountImpl?: string;
  webAuthnAccount?: string;
  a7a5NativeOracle?: string;
  usdtNativeOracle?: string;
  a7a5TwapOracle?: string;
}

export interface ForkStatus {
  healthy: boolean;
  blockNumber: number | null;
  chainId: number | null;
  syncing: boolean;
  rpcUrl: string;
  entryPointDeposit?: { a7a5?: bigint; usdt?: bigint };
  error?: string;
}

export function useForkStatus() {
  const [status, setStatus] = useState<ForkStatus>({
    healthy: false,
    blockNumber: null,
    chainId: null,
    syncing: false,
    rpcUrl: env.forkRpcUrl,
  });
  const [deployJson, setDeployJson] = useState<ForkDeployAddresses>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
      const [blockNumber, network] = await Promise.all([
        provider.getBlockNumber(),
        provider.getNetwork(),
      ]);

      let entryPointDeposit: ForkStatus['entryPointDeposit'];
      if (aaConfig.entryPoint && aaConfig.a7a5Paymaster && aaConfig.usdtPaymaster) {
        const ep = new Contract(aaConfig.entryPoint, ENTRYPOINT_EXTENDED_ABI, provider);
        const [a7a5Dep, usdtDep] = await Promise.all([
          ep.balanceOf(aaConfig.a7a5Paymaster) as Promise<bigint>,
          ep.balanceOf(aaConfig.usdtPaymaster) as Promise<bigint>,
        ]);
        entryPointDeposit = { a7a5: a7a5Dep, usdt: usdtDep };
      }

      setStatus({
        healthy: true,
        blockNumber,
        chainId: Number(network.chainId),
        syncing: false,
        rpcUrl: env.forkRpcUrl,
        entryPointDeposit,
      });
    } catch (e) {
      setStatus({
        healthy: false,
        blockNumber: null,
        chainId: null,
        syncing: false,
        rpcUrl: env.forkRpcUrl,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const loadDeployJson = useCallback((raw: string) => {
    const parsed = JSON.parse(raw) as ForkDeployAddresses & Record<string, string>;
    setDeployJson({
      entryPoint: parsed.entryPoint,
      paraSwap: parsed.paraSwap,
      poolsFacade: parsed.poolsFacade,
      a7a5Paymaster: parsed.a7a5Paymaster,
      usdtPaymaster: parsed.usdtPaymaster,
      accountFactory: parsed.accountFactory,
      accountImpl: parsed.accountImpl,
      webAuthnAccount: parsed.webAuthnAccount,
      a7a5NativeOracle: parsed.a7a5NativeOracle,
      usdtNativeOracle: parsed.usdtNativeOracle,
      a7a5TwapOracle: parsed.a7a5TwapOracle ?? (parsed as Record<string, string>).twapOracle,
    });
  }, []);

  const contractTable = [
    { label: 'EntryPoint', envKey: 'VITE_ENTRYPOINT_V08', address: aaConfig.entryPoint },
    { label: 'Account Factory', envKey: 'VITE_ACCOUNT_FACTORY', address: aaConfig.accountFactory },
    { label: 'A7A5 Paymaster', envKey: 'VITE_A7A5_PAYMASTER', address: aaConfig.a7a5Paymaster },
    { label: 'USDT Paymaster', envKey: 'VITE_USDT_PAYMASTER', address: aaConfig.usdtPaymaster },
    { label: 'Pools Facade', envKey: 'VITE_POOLS_FACADE', address: aaConfig.poolsFacade },
    { label: 'ParaSwap', envKey: 'VITE_PARASWAP', address: aaConfig.paraSwap },
    { label: 'A7A5 TWAP Oracle', envKey: 'VITE_A7A5_TWAP_ORACLE', address: aaConfig.a7a5TwapOracle },
    { label: 'A7A5 Native Oracle', envKey: 'VITE_A7A5_NATIVE_ORACLE', address: aaConfig.a7a5NativeOracle },
    { label: 'USDT Native Oracle', envKey: 'VITE_USDT_NATIVE_ORACLE', address: aaConfig.usdtNativeOracle },
  ];

  return { status, loading, refresh, deployJson, loadDeployJson, contractTable };
}
