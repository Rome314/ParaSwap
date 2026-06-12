import { mainnet, tron, type Chain } from 'wagmi/chains';
import { env, isForkMode } from './env';

export type SupportedEVMChainId =
  | typeof mainnet.id // 1
  | typeof tron.id; // 728126428

type ChainMeta = {
  chain: Chain;
  alchemyNetwork: string | null;
  rpcURL: (key: string) => string;
  explorerURL: (key: string) => string;
  isTron: boolean;
};

/** Local Hardhat node (non-fork) — chainId 31337 when not mirroring mainnet. */
export const hardhatLocal = {
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
} as const satisfies Chain;

/** Mainnet fork at localhost:8545 — Hardhat config uses chainId 1. */
export const hardhatFork: Chain = {
  id: 1,
  name: 'Mainnet Fork',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [env.forkRpcUrl] } },
};

const productionChains: Record<SupportedEVMChainId, ChainMeta> = {
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
};

const forkChains: Record<typeof mainnet.id, ChainMeta> = {
  [mainnet.id]: {
    chain: hardhatFork,
    alchemyNetwork: null,
    rpcURL: () => env.forkRpcUrl,
    explorerURL: (key) => `https://etherscan.io/${key}`,
    isTron: false,
  },
};

export const SUPPORTED_CHAINS: Record<SupportedEVMChainId, ChainMeta> = isForkMode()
  ? { ...productionChains, ...forkChains }
  : productionChains;

export const SUPPORTED_CHAIN_IDS = (isForkMode()
  ? [mainnet.id]
  : Object.keys(SUPPORTED_CHAINS).map(Number)) as SupportedEVMChainId[];

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
