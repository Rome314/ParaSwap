function env(key: string, fallback = ''): string {
  const v = import.meta.env[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/** ERC-4337 / passkey smart-account configuration (Ethereum mainnet or fork). */
export const aaConfig = {
  entryPoint: env('VITE_ENTRYPOINT_V08'),
  accountFactory: env('VITE_ACCOUNT_FACTORY'),
  a7a5Paymaster: env('VITE_A7A5_PAYMASTER'),
  usdtPaymaster: env('VITE_USDT_PAYMASTER'),
  poolsFacade: env('VITE_POOLS_FACADE'),
  bundlerUrl: env('VITE_BUNDLER_URL'),
  /** P-256 public key coordinates from passkey registration (hex, 32 bytes each). */
  passkeyQx: env('VITE_PASSKEY_QX'),
  passkeyQy: env('VITE_PASSKEY_QY'),
} as const;

export function isAaConfigured(): boolean {
  return Boolean(
    aaConfig.entryPoint &&
      aaConfig.accountFactory &&
      aaConfig.bundlerUrl &&
      aaConfig.passkeyQx &&
      aaConfig.passkeyQy,
  );
}

export type GasToken = 'a7a5' | 'usdt';

export function paymasterFor(token: GasToken): string {
  return token === 'usdt' ? aaConfig.usdtPaymaster : aaConfig.a7a5Paymaster;
}
