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
  paraSwap: env('VITE_PARASWAP'),
  a7a5TwapOracle: env('VITE_A7A5_TWAP_ORACLE'),
  a7a5NativeOracle: env('VITE_A7A5_NATIVE_ORACLE'),
  usdtNativeOracle: env('VITE_USDT_NATIVE_ORACLE'),
  chainlinkUsdtEth: env('VITE_CHAINLINK_USDT_ETH', '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46'),
  bundlerUrl: env('VITE_BUNDLER_URL'),
  /** P-256 public key coordinates from passkey registration (hex, 32 bytes each). */
  passkeyQx: env('VITE_PASSKEY_QX'),
  passkeyQy: env('VITE_PASSKEY_QY'),
} as const;

/** Passkey coords come from WebAuthn localStorage — not required for AA infra gate. */
export function isAaConfigured(): boolean {
  return Boolean(aaConfig.entryPoint && aaConfig.accountFactory && aaConfig.bundlerUrl);
}

export type GasToken = 'a7a5' | 'usdt';

export function paymasterFor(token: GasToken): string {
  return token === 'usdt' ? aaConfig.usdtPaymaster : aaConfig.a7a5Paymaster;
}
