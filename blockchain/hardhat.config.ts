import 'dotenv/config';
import type {HardhatUserConfig} from 'hardhat/config';
import HardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

// Accept either an explicit full URL or just the API key (derive the mainnet URL).
// Blank env placeholders (`ALCHEMY_RPC_URL=`) must not block API-key fallback — use `||`, not `??`.
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY?.trim() ?? '';
const FORK_URL =
  process.env.ALCHEMY_RPC_URL?.trim() ||
  (ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');
const SEPOLIA_URL =
  process.env.SEPOLIA_RPC_URL?.trim() ||
  (ALCHEMY_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');

// Optional: pin to a block for deterministic fork tests (reproducible whale
// balances / pool state). Override with FORK_BLOCK; leave unset to use latest.
const FORK_BLOCK = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined;

const config: HardhatUserConfig = {
  plugins: [HardhatToolboxMochaEthers],
  solidity: {
    compilers: [
      {version: '0.8.22', settings: {optimizer: {enabled: true, runs: 200}}},
      {version: '0.8.27', settings: {optimizer: {enabled: true, runs: 200}}},
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
    mainnet: {
      type: 'http',
      chainType: 'l1',
      url: FORK_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: SEPOLIA_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? '',
    },
  },
};

export default config;
