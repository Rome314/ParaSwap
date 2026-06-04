/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Single Alchemy API key — RPC URL is derived per chain automatically.
  readonly VITE_ALCHEMY_API_KEY?: string;

  // Uniswap Routing API
  readonly VITE_UNISWAP_ROUTING_API_URL?: string;
  readonly VITE_UNISWAP_API_KEY?: string;

  // WalletConnect (optional)
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;

  // Project token addresses (deployment-specific, same across chains for this prototype)
  readonly VITE_A7A5_ADDRESS?: string;
  readonly VITE_WA7A5_ADDRESS?: string;

  // Pool addresses
  readonly VITE_UNIV2_PAIR_USDT_A7A5?: string;
  readonly VITE_UNIV3_POOL_USDT_WA7A5?: string;
  readonly VITE_UNIV3_FEE_TIER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
