import { mainnet, sepolia, tron, tronNile, tronShasta, type Chain } from 'wagmi/chains';
import { env } from './env';

export type SupportedEVMChainId =
  | typeof mainnet.id // 1
  | typeof tron.id; // 728126428
// | typeof sepolia.id // 11155111
// | typeof tronNile.id // 3448148188
// | typeof tronShasta.id // 2494104990
// | typeof hardhatLocal.id; // 31337

type ChainMeta = {
  chain: Chain;
  alchemyNetwork: string | null;
  rpcURL: (key: string) => string;
  explorerURL: (key: string) => string;
  isTron: boolean;
};

export const hardhatLocal = {
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
} as const satisfies Chain;

export const SUPPORTED_CHAINS: Record<SupportedEVMChainId, ChainMeta> = {
  [mainnet.id]: {
    chain: mainnet,
    alchemyNetwork: 'eth-mainnet',
    rpcURL: (key) => `https://eth-mainnet.g.alchemy.com/v2/${key}`,
    explorerURL: (key) => `${mainnet.blockExplorers.default.url}/${key}`,
    isTron: false,
  },
  [tron.id]: {
    chain: tron,
    alchemyNetwork: 'tron-mainnet',
    rpcURL: (key) => `https://tron-mainnet.g.alchemy.com/v2/${key}`,
    explorerURL: (key) => `${tron.blockExplorers.default.url}/${key}`,
    isTron: true,
  },
  // [sepolia.id]: {
  //   chain: sepolia,
  //   alchemyNetwork: 'eth-sepolia',
  //   rpcURL: (key) => `https://eth-sepolia.g.alchemy.com/v2/${key}`,
  // },

  // [tronNile.id]: {
  //   chain: tronNile,
  //   alchemyNetwork: 'tron-testnet',
  //   rpcURL: (key) => `https://tron-testnet.g.alchemy.com/v2/${key}`,
  //   isTron: true,
  // },
  // [tronShasta.id]: {
  //   chain: tronShasta,
  //   alchemyNetwork: 'tron-testnet',
  //   rpcURL: (key) => `https://tron-testnet.g.alchemy.com/v2/${key}`,
  //   isTron: true,
  // },

  // [hardhatLocal.id]: {
  //   chain: hardhatLocal,
  //   alchemyNetwork: null,
  //   rpcURL: () => 'http://127.0.0.1:8545',
  //   isTron: false,
  // },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(SUPPORTED_CHAINS).map(
  Number
) as SupportedEVMChainId[];

export function isSupportedChainId(id: number | undefined): id is SupportedEVMChainId {
  return id !== undefined && id in SUPPORTED_CHAINS;
}

export function isTronChain(chainId: SupportedEVMChainId): boolean {
  return SUPPORTED_CHAINS[chainId].isTron;
}

export function chainRpcURL(chainId: SupportedEVMChainId): string {
  const meta = SUPPORTED_CHAINS[chainId];
  if (!meta.alchemyNetwork) return meta.rpcURL('');
  return meta.rpcURL(env.alchemyApiKey || 'demo');
}
