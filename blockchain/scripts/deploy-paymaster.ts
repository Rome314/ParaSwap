// Deploy the A7A5 paymaster and register it with the EntryPoint (deposit + stake).
//
//   ORACLE=0x... ALCHEMY_API_KEY=... npx hardhat run scripts/deploy-paymaster.ts
//
// If ORACLE is unset, the oracle stack is deployed first via deploy-oracle.ts.
// Follows the project's defi-security launch guidance: transfer ownership to a multisig and
// keep the pause / withdraw paths gated. Uses an in-process mainnet fork by default.
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';

const DEPOSIT_ETH = process.env.DEPOSIT_ETH ?? '5';
const STAKE_ETH = process.env.STAKE_ETH ?? '1';
const UNSTAKE_DELAY = Number(process.env.UNSTAKE_DELAY ?? '86400'); // 1 day
const TWAP_WINDOW = Number(process.env.TWAP_WINDOW ?? '1800');
const MAX_STALENESS = Number(process.env.MAX_STALENESS ?? String(2 * 24 * 60 * 60));

const conn = await network.create('hardhat');
const {ethers} = conn;

async function deployOracleStack(owner: string): Promise<string> {
  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5,
    ADDRESSES.WA7A5,
    ADDRESSES.USDT,
    TWAP_WINDOW,
    owner,
  ]);
  await twap.waitForDeployment();
  const oracle = await ethers.deployContract('A7A5NativeOracle', [
    await twap.getAddress(),
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    owner,
  ]);
  await oracle.waitForDeployment();
  return oracle.getAddress();
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = await deployer.getAddress();

  let oracleAddr = process.env.ORACLE;
  if (!oracleAddr) {
    oracleAddr = await deployOracleStack(owner);
    console.log(`Deployed oracle stack; A7A5NativeOracle: ${oracleAddr}`);
  }

  const paymaster = await ethers.deployContract('A7A5Paymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.A7A5,
    oracleAddr,
    owner,
  ]);
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();

  await (await (paymaster as any).deposit({value: ethers.parseEther(DEPOSIT_ETH)})).wait();
  await (await (paymaster as any).addStake(UNSTAKE_DELAY, {value: ethers.parseEther(STAKE_ETH)})).wait();

  console.log(`A7A5Paymaster: ${paymasterAddr}`);
  console.log(`  EntryPoint:  ${ADDRESSES.ENTRYPOINT_V08}`);
  console.log(`  deposit:     ${DEPOSIT_ETH} ETH`);
  console.log(`  stake:       ${STAKE_ETH} ETH (unstakeDelay=${UNSTAKE_DELAY}s)`);
  console.log('\nNext: transfer ownership to a multisig, then fund accounts with A7A5 and approve the paymaster.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
