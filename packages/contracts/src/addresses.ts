/**
 * Canonical on-chain addresses for ParaSwap consumers (frontend, backend, subgraph, tests).
 * Env overrides apply at runtime for deployment-specific contracts.
 */

export type ChainAddresses = {
  A7A5: string;
  WA7A5: string;
  USDT: string;
  WETH: string;
  USDC: string;
  ETH: string;
  MULTICALL3: string;
  UNIVERSAL_ROUTER: string;
  V2_ROUTER: string;
  SWAP_ROUTER_02: string;
  PERMIT2: string;
  QUOTER_V2: string;
  V2_FACTORY: string;
  V3_FACTORY: string;
  V2_PAIR_USDT_A7A5: string;
  V3_POOL_USDT_WA7A5: string;
  V3_FEE_TIER: number;
  V4_POOL_MANAGER: string;
  V4_QUOTER: string;
  ENTRYPOINT_V08: string;
  ENTRYPOINT_V09: string;
  CHAINLINK_USDT_ETH: string;
  A7A5_WHALE: string;
  WA7A5_WHALE: string;
  USDT_WHALE: string;
  USDC_WHALE: string;
  WETH_WHALE: string;
  /** Deployed ParaSwap router — set via env after deploy */
  PARASWAP?: string;
  /** Deployed PoolsFacade — set via env after deploy */
  POOLS_FACADE?: string;
};

const MAINNET_DEFAULTS: ChainAddresses = {
  A7A5: '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9',
  WA7A5: '0xF442fF10b8deF89514560A66C0AD28777094636a',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ETH: '0x0000000000000000000000000000000000000000',
  MULTICALL3: '0xca11bde05977b3631167028862be2a173976ca11',
  UNIVERSAL_ROUTER: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
  V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SWAP_ROUTER_02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  V2_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  V2_PAIR_USDT_A7A5: '0x14D7AAB5b4bca6a02E52aC22520B033bF35F4091',
  V3_POOL_USDT_WA7A5: '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9',
  V3_FEE_TIER: 500,
  V4_POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  V4_QUOTER: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',
  ENTRYPOINT_V08: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',
  ENTRYPOINT_V09: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
  CHAINLINK_USDT_ETH: '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46',
  A7A5_WHALE: '0xF442fF10b8deF89514560A66C0AD28777094636a',
  WA7A5_WHALE: '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9',
  USDT_WHALE: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  USDC_WHALE: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
  WETH_WHALE: '0x11b815efB8f581194ae79006d24E0d814B7697F6',
};

const SEPOLIA_DEFAULTS: Partial<ChainAddresses> = {
  A7A5: '0x0000000000000000000000000000000000000000',
  WA7A5: '0x0000000000000000000000000000000000000000',
  V2_PAIR_USDT_A7A5: '0x0000000000000000000000000000000000000000',
  V3_POOL_USDT_WA7A5: '0x0000000000000000000000000000000000000000',
};

function env(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
}

function withEnvOverrides(base: ChainAddresses): ChainAddresses {
  return {
    ...base,
    A7A5: env('A7A5_ADDRESS') ?? env('VITE_A7A5_ADDRESS') ?? base.A7A5,
    WA7A5: env('WA7A5_ADDRESS') ?? env('VITE_WA7A5_ADDRESS') ?? base.WA7A5,
    V2_PAIR_USDT_A7A5:
      env('V2_PAIR_USDT_A7A5') ??
      env('VITE_UNIV2_PAIR_USDT_A7A5') ??
      base.V2_PAIR_USDT_A7A5,
    V3_POOL_USDT_WA7A5:
      env('V3_POOL_USDT_WA7A5') ??
      env('VITE_UNIV3_POOL_USDT_WA7A5') ??
      base.V3_POOL_USDT_WA7A5,
    V3_FEE_TIER: Number(env('UNIV3_FEE_TIER') ?? env('VITE_UNIV3_FEE_TIER') ?? base.V3_FEE_TIER),
    ENTRYPOINT_V08: env('ENTRYPOINT') ?? base.ENTRYPOINT_V08,
    CHAINLINK_USDT_ETH: env('CHAINLINK_USDT_ETH') ?? base.CHAINLINK_USDT_ETH,
    A7A5_WHALE: env('A7A5_WHALE') ?? base.A7A5_WHALE,
    WA7A5_WHALE: env('WA7A5_WHALE') ?? base.WA7A5_WHALE,
    USDT_WHALE: env('USDT_WHALE') ?? base.USDT_WHALE,
    USDC_WHALE: env('USDC_WHALE') ?? base.USDC_WHALE,
    WETH_WHALE: env('WETH_WHALE') ?? base.WETH_WHALE,
    PARASWAP: env('PARASWAP_ADDRESS') ?? base.PARASWAP,
    POOLS_FACADE: env('POOLS_FACADE_ADDRESS') ?? base.POOLS_FACADE,
  };
}

export const ethereum = {
  mainnet: withEnvOverrides(MAINNET_DEFAULTS),
  sepolia: withEnvOverrides({...MAINNET_DEFAULTS, ...SEPOLIA_DEFAULTS}),
} as const;

/** Flat mainnet map used by Hardhat fork tests (legacy `ADDRESSES` shape). */
export const ADDRESSES = {
  ...ethereum.mainnet,
  // Legacy alias used in tests/scripts
  ENTRYPOINT: ethereum.mainnet.ENTRYPOINT_V08,
} as const;

export type AddressesMap = typeof ADDRESSES;

/** Frontend protocol shape keyed by EVM chain id */
export type A7A5TokenAddresses = {
  A7A5: string;
  WA7A5: string | undefined;
  V2_PAIR_USDT_A7A5: string | undefined;
  V3_POOL_USDT_WA7A5: string | undefined;
  V3_FEE_TIER: number | undefined;
};

export type UniswapAddresses = {
  WETH: string;
  UNIVERSAL_ROUTER: string;
  SWAP_ROUTER_02: string;
  PERMIT2: string;
  QUOTER_V2: string;
  V2_FACTORY: string;
  V3_FACTORY: string;
};

export type ProtocolAddresses = {
  USDT: string;
  MULTICALL3: string;
  A7A5: A7A5TokenAddresses;
  UNISWAP: UniswapAddresses | undefined;
};

const ETHEREUM_MAINNET_ID = 1;
const TRON_MAINNET_ID = 728126428;

export const PROTOCOL_BY_CHAIN: Record<number, ProtocolAddresses> = {
  [ETHEREUM_MAINNET_ID]: {
    USDT: ethereum.mainnet.USDT,
    MULTICALL3: ethereum.mainnet.MULTICALL3,
    A7A5: {
      A7A5: ethereum.mainnet.A7A5,
      WA7A5: ethereum.mainnet.WA7A5,
      V2_PAIR_USDT_A7A5: ethereum.mainnet.V2_PAIR_USDT_A7A5,
      V3_POOL_USDT_WA7A5: ethereum.mainnet.V3_POOL_USDT_WA7A5,
      V3_FEE_TIER: ethereum.mainnet.V3_FEE_TIER,
    },
    UNISWAP: {
      WETH: ethereum.mainnet.WETH,
      UNIVERSAL_ROUTER: ethereum.mainnet.UNIVERSAL_ROUTER,
      SWAP_ROUTER_02: ethereum.mainnet.SWAP_ROUTER_02,
      PERMIT2: ethereum.mainnet.PERMIT2,
      QUOTER_V2: ethereum.mainnet.QUOTER_V2,
      V2_FACTORY: ethereum.mainnet.V2_FACTORY,
      V3_FACTORY: ethereum.mainnet.V3_FACTORY,
    },
  },
  [TRON_MAINNET_ID]: {
    USDT: ethereum.mainnet.USDT,
    MULTICALL3: 'TGBc4qWKhBHEf7vKNVz8cpjBXCxrMhVHMN',
    A7A5: {
      A7A5: 'TLeVfrdym8RoJreJ23dAGyfJDygRtiWKBZ',
      WA7A5: undefined,
      V2_PAIR_USDT_A7A5: undefined,
      V3_POOL_USDT_WA7A5: undefined,
      V3_FEE_TIER: undefined,
    },
    UNISWAP: undefined,
  },
};

export function getProtocolAddresses(chainId: number): ProtocolAddresses | undefined {
  return PROTOCOL_BY_CHAIN[chainId];
}

export const TRC20_A7A5_ADDRESS = '';
