function requireEnv(key: string, fallback?: string): string {
  const v = import.meta.env[key] ?? fallback;
  if (v === undefined || v === '') {
    console.warn(`[config] ${key} is not set`);
    return '';
  }
  return v;
}

export const env = {
  alchemyApiKey: requireEnv('VITE_ALCHEMY_API_KEY'),
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  entryPoint: import.meta.env.VITE_ENTRYPOINT_V08 ?? '',
  accountFactory: import.meta.env.VITE_ACCOUNT_FACTORY ?? '',
  a7a5Paymaster: import.meta.env.VITE_A7A5_PAYMASTER ?? '',
  usdtPaymaster: import.meta.env.VITE_USDT_PAYMASTER ?? '',
  bundlerUrl: import.meta.env.VITE_BUNDLER_URL ?? '',
} as const;
