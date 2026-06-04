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
} as const;
