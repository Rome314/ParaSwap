/**
 * Sepolia testnet addresses for AA-stack deployment.
 *
 * A7A5 / wA7A5 / project pools do not exist on Sepolia — Ignition deploys mocks
 * (see ignition/modules/SepoliaMocks.ts). Uniswap infra below is real Sepolia
 * deployment; used only if SwapStack is enabled later.
 */
export const SEPOLIA_ADDRESSES = {
  CHAIN_ID: 11_155_111,

  /** Canonical EntryPoint v0.8 (same on all chains). */
  ENTRYPOINT_V08: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',

  /** No Chainlink USDT/ETH on Sepolia — ignition uses MockChainlinkFeed. */
  CHAINLINK_ETH_USD: '0x694AA1769357215DE4FAC081bf1f309aDC325306',

  /** Circle test USDT on Sepolia (optional override if mocks are not used). */
  USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D6433D4',

  WETH: '0xfff9976802a46A56ff0651f3fF3B0D5C5674A2D8',

  /** Uniswap V3 Sepolia periphery (for optional SwapStack). */
  SWAP_ROUTER_02: '0x3bFA4769EB2093B5a6E111339A65922EA25e7fe8',
  QUOTER_V2: '0xEd1f6473345F45b75F877c7Ae9c45F4C3a448F34',
  V3_FACTORY: '0x0227628f3F7231eD1D1224bf545245B76b4429C8',
  V2_FACTORY: '0x7E0987E5b3a30e3f2828572Bb659A548460a3003',
} as const;
