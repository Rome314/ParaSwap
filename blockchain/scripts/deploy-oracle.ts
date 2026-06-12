// Deploy the A7A5 price-oracle stack: the A7A5/USDT TWAP feed (Chainlink-compatible)
// and the A7A5-per-native adapter that combines it with the Chainlink USDT/ETH feed.
//
//   ALCHEMY_API_KEY=... npx hardhat run scripts/deploy-oracle.ts
//
// Prints the deployed addresses. Uses an in-process mainnet fork by default; point at a
// real network by swapping `network.create('hardhat')` for `network.connect()`.
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';

const TWAP_WINDOW = Number(process.env.TWAP_WINDOW ?? '1800'); // 30 min default for production
const MAX_STALENESS = Number(process.env.MAX_STALENESS ?? String(2 * 24 * 60 * 60)); // 2 days

const conn = await network.create('hardhat');
const {ethers} = conn;

export async function deployOracleStack(owner: string) {
  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.WA7A5, ADDRESSES.USDT, TWAP_WINDOW, owner]);
  await twap.waitForDeployment();
  const twapAddr = await twap.getAddress();

  const oracle = await ethers.deployContract('A7A5NativeOracle', [twapAddr, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.WA7A5, MAX_STALENESS, owner]);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();

  return {twap, twapAddr, oracle, oracleAddr};
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = await deployer.getAddress();
  console.log(`Deployer/owner: ${owner}`);

  const {twapAddr, oracleAddr} = await deployOracleStack(owner);
  console.log(`A7A5UsdtTwapOracle: ${twapAddr}  (window=${TWAP_WINDOW}s)`);
  console.log(`A7A5NativeOracle:   ${oracleAddr}  (maxStaleness=${MAX_STALENESS}s)`);
  console.log('\nNOTE: a fresh fork pool may need TWAP warm-up before reads succeed.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
