function requireEnv(key: string, fallback?: string): string {
  const v = import.meta.env[key] ?? fallback;
  if (v === undefined || v === '') {
    console.warn(`[config] ${key} is not set`);
    return '';
  }
  return v;
}

export type AppChainMode = 'production' | 'hardhat-fork';

export const env = {
  chainMode: (import.meta.env.VITE_CHAIN === 'hardhat-fork'
    ? 'hardhat-fork'
    : 'production') as AppChainMode,
  forkRpcUrl: import.meta.env.VITE_FORK_RPC_URL ?? 'http://127.0.0.1:8545',
  alchemyApiKey: requireEnv('VITE_ALCHEMY_API_KEY'),
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  entryPoint: import.meta.env.VITE_ENTRYPOINT_V08 ?? '',
  accountFactory: import.meta.env.VITE_ACCOUNT_FACTORY ?? '',
  a7a5Paymaster: import.meta.env.VITE_A7A5_PAYMASTER ?? '',
  usdtPaymaster: import.meta.env.VITE_USDT_PAYMASTER ?? '',
  poolsFacade: import.meta.env.VITE_POOLS_FACADE ?? '',
  paraSwap: import.meta.env.VITE_PARASWAP ?? '',
  a7a5TwapOracle: import.meta.env.VITE_A7A5_TWAP_ORACLE ?? '',
  a7a5NativeOracle: import.meta.env.VITE_A7A5_NATIVE_ORACLE ?? '',
  usdtNativeOracle: import.meta.env.VITE_USDT_NATIVE_ORACLE ?? '',
  chainlinkUsdtEth: import.meta.env.VITE_CHAINLINK_USDT_ETH ?? '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46',
  bundlerUrl: import.meta.env.VITE_BUNDLER_URL ?? '',
} as const;

export function isForkMode(): boolean {
  return env.chainMode === 'hardhat-fork';
}
