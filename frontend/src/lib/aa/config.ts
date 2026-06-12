function env(key: string, fallback = ''): string {
  const v = import.meta.env[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

/** Return an address env var lowercased so ethers never rejects it for a bad EIP-55 checksum. */
function addr(key: string, fallback = ''): string {
  const v = env(key, fallback);
  return v.startsWith('0x') && v.length === 42 ? v.toLowerCase() : v;
}

/** ERC-4337 / passkey smart-account configuration (Ethereum mainnet or fork). */
export const aaConfig = {
  entryPoint: addr('VITE_ENTRYPOINT_V08'),
  accountFactory: addr('VITE_ACCOUNT_FACTORY'),
  eip7702Delegate: addr('VITE_EIP7702_DELEGATE'),
  a7a5Paymaster: addr('VITE_A7A5_PAYMASTER'),
  usdtPaymaster: addr('VITE_USDT_PAYMASTER'),
  poolsFacade: addr('VITE_POOLS_FACADE'),
  paraSwap: addr('VITE_PARASWAP'),
  a7a5TwapOracle: addr('VITE_A7A5_TWAP_ORACLE'),
  a7a5NativeOracle: addr('VITE_A7A5_NATIVE_ORACLE'),
  usdtNativeOracle: addr('VITE_USDT_NATIVE_ORACLE'),
  chainlinkUsdtEth: addr('VITE_CHAINLINK_USDT_ETH', '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46'),
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

/** Token addresses on the fork (mirrors mainnet). */
export const aaTokens = {
  a7a5: addr('VITE_A7A5_ADDRESS', '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9'),
  wa7a5: addr('VITE_WA7A5_ADDRESS', '0xF442fF10b8deF89514560A66C0AD28777094636a'),
  usdt: addr('VITE_USDT_ADDRESS', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
} as const;
