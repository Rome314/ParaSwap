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
    // Truffle Dashboard signs transactions via MetaMask — no private key needed.
    // Run `npm run dashboard:open`, then use --network truffle-dashboard for Ignition deploys.
    // Do NOT use this network for fork-setup-and-demo.ts (requires evm_* methods unavailable via Dashboard).
    'truffle-dashboard': {
      type: 'http',
      chainType: 'l1',
      url: 'http://localhost:24012/rpc',
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
