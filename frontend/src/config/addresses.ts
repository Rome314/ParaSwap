import { mainnet, sepolia, tron, tronNile, tronShasta } from 'wagmi/chains';
import type { SupportedEVMChainId } from './chains';
import { hardhatLocal } from './chains';

export const TRC20_A7A5_ADDRESS = '';

type ProtocolAddresses = {
  USDT: string;
  MULTICALL3: string;
  A7A5: A7A5_Addresses;
  UNISWAP: UniswapAddresses | undefined;
};

type A7A5_Addresses = {
  A7A5: string;
  WA7A5: string | undefined;
  V2_PAIR_USDT_A7A5: string | undefined;
  V3_POOL_USDT_WA7A5: string | undefined;
  V3_FEE_TIER: Number | undefined;
};

type UniswapAddresses = {
  WETH: string;
  UNIVERSAL_ROUTER: string;
  SWAP_ROUTER_02: string;
  PERMIT2: string;
  QUOTER_V2: string;
  V2_FACTORY: string;
  V3_FACTORY: string;
};

const PROTOCOL: Record<SupportedEVMChainId, ProtocolAddresses> = {
  [mainnet.id]: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    MULTICALL3: mainnet.contracts.multicall3.address,
    A7A5: {
      A7A5: '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9',
      WA7A5: '0xF442fF10b8deF89514560A66C0AD28777094636a',
      V2_PAIR_USDT_A7A5: '0x14D7AAB5b4bca6a02E52aC22520B033bF35F4091',
      V3_POOL_USDT_WA7A5: '0xB6d629cb247333DD5e273B75741c55DfEca6f6e9',
      V3_FEE_TIER: 500,
    },
    UNISWAP: {
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      UNIVERSAL_ROUTER: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
      SWAP_ROUTER_02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
      PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
      QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      V2_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
      V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
  },
  [tron.id]: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
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

// // Project tokens and pools are deployment-specific (from env vars).
// const PROJECT = {
//   A7A5: import.meta.env.VITE_A7A5_ADDRESS ?? '0x0000000000000000000000000000000000000000',
//   WA7A5: import.meta.env.VITE_WA7A5_ADDRESS ?? '0x0000000000000000000000000000000000000000',
//   V2_PAIR_USDT_A7A5:
//     import.meta.env.VITE_UNIV2_PAIR_USDT_A7A5 ?? '0x0000000000000000000000000000000000000000',
//   V3_POOL_USDT_WA7A5:
//     import.meta.env.VITE_UNIV3_POOL_USDT_WA7A5 ?? '0x0000000000000000000000000000000000000000',
//   V3_FEE_TIER: Number(import.meta.env.VITE_UNIV3_FEE_TIER ?? '500'),
// };

export type Addresses = ProtocolAddresses;
// & typeof PROJECT;

export function getAddresses(chainId: SupportedEVMChainId): Addresses {
  // return { ...PROTOCOL[chainId], ...PROJECT };
  return PROTOCOL[chainId];
}
