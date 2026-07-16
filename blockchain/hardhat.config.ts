import 'dotenv/config';
import type {HardhatUserConfig} from 'hardhat/config';
import type {HardhatPlugin} from 'hardhat/types/plugins';
import HardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

// openzeppelin-community-contracts ships a Foundry-style remappings.txt that maps
// @openzeppelin/contracts/ → lib/@openzeppelin-contracts/contracts/ (a path that only
// exists in a Foundry workspace). Hardhat 3 reads that file and breaks npm resolution.
// This inline plugin intercepts the hook and strips the Foundry-only remappings so
// Hardhat falls back to resolving @openzeppelin/contracts via npm as normal.
const ozCommunityRemappingFix: HardhatPlugin = {
  id: 'oz-community-remapping-fix',
  hookHandlers: {
    solidity: async () => ({
      default: async () => ({
        readNpmPackageRemappings: async (ctx, name, version, pkgPath, next) => {
          const sources = await next(ctx, name, version, pkgPath);
          if (name.includes('community-contracts')) {
            return sources.map((s) => ({
              ...s,
              remappings: s.remappings.filter((r) => !r.startsWith('@openzeppelin/contracts/=lib/')),
            }));
          }
          return sources;
        },
      }),
    }),
  },
};

// Accept either an explicit full URL or just the API key (derive the mainnet URL).
// Blank env placeholders (`ALCHEMY_RPC_URL=`) must not block API-key fallback — use `||`, not `??`.
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY?.trim() ?? '';
const FORK_URL =
  process.env.MAINNET_RPC_URL?.trim() ||
  process.env.ALCHEMY_RPC_URL?.trim() ||
  (ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');
const SEPOLIA_URL = process.env.SEPOLIA_RPC_URL?.trim() || (ALCHEMY_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim() ?? '';

const networkFlag = process.argv.indexOf('--network');
const selectedNetwork = networkFlag === -1 ? undefined : process.argv[networkFlag + 1];
if (selectedNetwork === 'mainnet' && !FORK_URL) {
  throw new Error('MAINNET_RPC_URL (or ALCHEMY_RPC_URL/ALCHEMY_API_KEY) is required for mainnet');
}
if (selectedNetwork === 'sepolia' && !SEPOLIA_URL) {
  throw new Error('SEPOLIA_RPC_URL (or ALCHEMY_API_KEY) is required for Sepolia');
}
if ((selectedNetwork === 'mainnet' || selectedNetwork === 'sepolia') && !DEPLOYER_PRIVATE_KEY) {
  throw new Error(`DEPLOYER_PRIVATE_KEY is required for ${selectedNetwork}`);
}

// Optional: pin to a block for deterministic fork tests (reproducible whale
// balances / pool state). Override with FORK_BLOCK; leave unset to use latest.
const FORK_BLOCK = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined;

const config: HardhatUserConfig = {
  plugins: [ozCommunityRemappingFix, HardhatToolboxMochaEthers],
  solidity: {
    compilers: [
      {version: '0.8.22', settings: {optimizer: {enabled: true, runs: 200}, outputSelection: {'*': {'*': ['storageLayout']}}}},
      {version: '0.8.27', settings: {optimizer: {enabled: true, runs: 200}, outputSelection: {'*': {'*': ['storageLayout']}}}},
    ],
  },
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainType: 'l1',
      // Forked chain mirrors Ethereum mainnet, so the deployed A7A5/WA7A5 and the
      // real Uniswap pools are available for impersonation-funded fork tests.
      chainId: 1,
      blockGasLimit: 30_000_000,
      ...(FORK_URL
        ? {
            forking: {
              url: FORK_URL,
              ...(FORK_BLOCK ? {blockNumber: FORK_BLOCK} : {}),
            },
          }
        : {}),
    },
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:8545',
      chainId: 1,
      // 'remote' skips Hardhat's LocalAccountsHandler so eth_sendTransaction is forwarded
      // directly to the node. This is required for whale impersonation on Ganache: the node
      // has the whale addresses pre-unlocked and must sign on their behalf, but LocalAccountsHandler
      // would intercept and throw HHE716 ("account not managed") before the request reaches Ganache.
      // Both Ganache and Hardhat node handle eth_sendTransaction natively for their own accounts.
      accounts: 'remote',
    },
    mainnet: {
      type: 'http',
      chainType: 'l1',
      url: FORK_URL || 'http://127.0.0.1:8545',
      chainId: 1,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: SEPOLIA_URL || 'http://127.0.0.1:8545',
      chainId: 11155111,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? '',
    },
  },
};

export default config;
