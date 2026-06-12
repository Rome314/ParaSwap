// Starts a Ganache mainnet fork on http://127.0.0.1:8545.
// Reads ALCHEMY_API_KEY / ALCHEMY_RPC_URL and FORK_BLOCK from blockchain/.env.
// Use instead of `npm run node:fork` when Hardhat node has issues.
//
//   npm run ganache:fork        (from blockchain/)
'use strict';

require('dotenv').config();
const ganache = require('ganache');

const ALCHEMY_KEY = (process.env.ALCHEMY_API_KEY || '').trim();
const forkUrl =
  (process.env.ALCHEMY_RPC_URL || '').trim() ||
  (ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : '');
const forkBlock = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : 25271161;

if (!forkUrl) {
  console.error('Error: set ALCHEMY_API_KEY or ALCHEMY_RPC_URL in blockchain/.env');
  process.exit(1);
}

console.log(`Starting Ganache mainnet fork at block ${forkBlock}...`);

const server = ganache.server({
  fork: {url: forkUrl, blockNumber: forkBlock},
  // Explicit cancun hardfork so newly mined blocks use the same EVM as the forked mainnet
  // (block 25271161 is post-Cancun). Without this Ganache may default to an older hardfork
  // and the EntryPoint / account bytecode that relies on Cancun opcodes hits 'invalid opcode'.
  chain: {chainId: 1, hardfork: 'cancun'},
  // Same mnemonic as Hardhat's default test accounts so that the private keys
  // configured in hardhat.config.ts localhost.accounts match the funded genesis accounts.
  // unlockedAccounts lets the fork script impersonate whale addresses and the EntryPoint
  // without needing evm_unlockUnknownAccount at runtime (which Ganache supports unreliably).
  wallet: {
    mnemonic: 'test test test test test test test test test test test junk',
    totalAccounts: 10,
    defaultBalance: 10_000,
    unlockedAccounts: [
      '0xF442fF10b8deF89514560A66C0AD28777094636a', // WA7A5 contract  (A7A5_WHALE)
      '0xF977814e90dA44bFA03b6295A0616a897441aceC', // Binance hot wallet (USDT_WHALE)
      '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108', // EntryPoint v0.8  (approveAsEntryPoint)
    ],
  },
  logging: {verbose: false},
});

server.listen(8545, (err) => {
  if (err) {
    console.error('Failed to start Ganache:', err);
    process.exit(1);
  }
  console.log(`\nGanache ready → http://127.0.0.1:8545  chainId=1  block=${forkBlock}`);
  console.log('Now run: npm run fork:deploy (in another terminal)');
  console.log('Ctrl-C to stop.\n');
});

process.on('SIGINT', () => {
  console.log('\nShutting down Ganache...');
  server
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
