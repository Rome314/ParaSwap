import 'dotenv/config';
import type {HardhatUserConfig} from 'hardhat/config';
import HardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

// Accept either an explicit full URL or just the API key (derive the mainnet URL).
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY ?? '';
const FORK_URL = process.env.ALCHEMY_RPC_URL ?? (ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');

// Optional: pin to a block for deterministic fork tests (reproducible whale
// balances / pool state). Override with FORK_BLOCK; leave unset to use latest.
const FORK_BLOCK = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined;

const config: HardhatUserConfig = {
  plugins: [HardhatToolboxMochaEthers],
  solidity: {
    version: '0.8.22',
    settings: {optimizer: {enabled: true, runs: 200}},
  },
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainType: 'l1',
      // Forked chain mirrors Ethereum mainnet, so the deployed A7A5/WA7A5 and the
      // real Uniswap pools are available for impersonation-funded fork tests.
      chainId: 1,
      ...(FORK_URL
        ? {
            forking: {
              url: FORK_URL,
              ...(FORK_BLOCK ? {blockNumber: FORK_BLOCK} : {}),
            },
          }
        : {}),
    },
  },
};

export default config;
