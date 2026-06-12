// Ethereum mainnet addresses for fork tests.
// Protocol/token values mirror the frontend config (frontend/src/config/addresses.ts).

/** `.env` placeholders are often blank strings; `??` would keep those and break ethers. */
function envOr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v ? v : fallback;
}

export const ADDRESSES = {
  // ── Project tokens (real mainnet deployments) ──────────────────────────────
  A7A5: '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9',
  WA7A5: '0xF442fF10b8deF89514560A66C0AD28777094636a',
  MULTICALL3: '0xca11bde05977b3631167028862be2a173976ca11',

  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // 6-dec V3 second-hop target
  ETH: '0x0000000000000000000000000000000000000000', // native ETH (V4 currency0)

  // ── Uniswap protocol (mainnet) ─────────────────────────────────────────────
  UNIVERSAL_ROUTER: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
  V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // UniswapV2Router02
  SWAP_ROUTER_02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  V2_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',

  // ── Project pools (mainnet) ────────────────────────────────────────────────
  V2_PAIR_USDT_A7A5: '0x14D7AAB5b4bca6a02E52aC22520B033bF35F4091',
  V3_POOL_USDT_WA7A5: '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9',
  V3_FEE_TIER: Number(envOr('UNIV3_FEE_TIER', '500')),

  // ── Uniswap V4 (mainnet) — used to investigate whether a V4 wA7A5/USDT pool
  //    actually exists; the router is built for V4 but the frontend uses V3. ──
  V4_POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  V4_QUOTER: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',

  // ── ERC-4337 / paymaster (mainnet) ─────────────────────────────────────────
  // Canonical EntryPoint singletons (same address on every chain). Override via
  // env when a pinned FORK_BLOCK predates a given version's deployment.
  ENTRYPOINT_V08: envOr('ENTRYPOINT', '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'),
  ENTRYPOINT_V09: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
  // Chainlink USDT/ETH feed (returns ETH-per-USDT, 18 decimals).
  CHAINLINK_USDT_ETH: envOr('CHAINLINK_USDT_ETH', '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46'),

  // ── Whale accounts (fork funding via impersonation) ────────────────────────
  // Defaults are real on-chain holders at recent blocks; override via env if a
  // pinned FORK_BLOCK needs different sources. Verified by scripts/find-whales.ts.
  A7A5_WHALE: envOr('A7A5_WHALE', '0xF442fF10b8deF89514560A66C0AD28777094636a'), // WA7A5 contract holds A7A5 backing
  WA7A5_WHALE: envOr('WA7A5_WHALE', '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9'), // V3 pool holds wA7A5
  USDT_WHALE: envOr('USDT_WHALE', '0xF977814e90dA44bFA03b6295A0616a897441aceC'), // Binance hot wallet
  USDC_WHALE: envOr('USDC_WHALE', '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'), // USDC/ETH V3 0.05% pool
  WETH_WHALE: envOr('WETH_WHALE', '0x11b815efB8f581194ae79006d24E0d814B7697F6'), // WETH/USDT V3 0.05% pool
} as const;
