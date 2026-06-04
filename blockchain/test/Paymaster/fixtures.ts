import {ADDRESSES} from '../../common/addresses.js';
import {ENTRYPOINT_ABI} from '../../common/erc4337.js';
import {fundFromWhale} from '../helpers.js';
import {
  conn,
  ethers,
  networkHelpers,
  SIDE,
  TWAP_WINDOW,
  MAX_STALENESS,
  A7A5_GAS_FUNDING,
  USDT_POKE,
  V3_POOL_ABI,
  FAR_DEADLINE,
} from './consts.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

/**
 * Deploy the full A7A5 gas-payment stack on a mainnet fork:
 * PoolsFacade + ParaSwap, the A7A5/USDT TWAP oracle, the A7A5-per-native adapter, the
 * A7A5 paymaster (deposited + staked in the EntryPoint) and a smart account funded with A7A5.
 */
export async function deployPaymasterStackFixture() {
  const [deployer, owner, bundler] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const ownerAddr = await owner.getAddress();

  // 1. Core swap contracts.
  const facade = await ethers.deployContract('PoolsFacade', [
    ADDRESSES.WA7A5,
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
    ADDRESSES.V2_PAIR_USDT_A7A5,
    ADDRESSES.SWAP_ROUTER_02,
    ADDRESSES.QUOTER_V2,
    ADDRESSES.V3_FEE_TIER,
  ]);
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();

  const paraSwap = await ethers.deployContract('ParaSwap', [facadeAddr, ADDRESSES.SWAP_ROUTER_02]);
  await paraSwap.waitForDeployment();
  const paraSwapAddr = await paraSwap.getAddress();

  // 2. Oracle chain.
  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5,
    ADDRESSES.WA7A5,
    ADDRESSES.USDT,
    TWAP_WINDOW,
    deployerAddr,
  ]);
  await twap.waitForDeployment();
  const twapAddr = await twap.getAddress();

  const oracle = await ethers.deployContract('A7A5NativeOracle', [
    twapAddr,
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    deployerAddr,
  ]);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();

  // 3. Warm up the V3 observation buffer so the TWAP window has history.
  await warmUpTwap(deployer, facade, facadeAddr, deployerAddr);

  // 4. Paymaster, deposited + staked in the EntryPoint.
  const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, ENTRYPOINT_ABI, deployer);
  const paymaster = await ethers.deployContract('A7A5Paymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.A7A5,
    oracleAddr,
    deployerAddr,
  ]);
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();
  await (await (paymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (paymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  // 5. Smart account owned by `owner`.
  const account = await ethers.deployContract('SimpleA7A5Account', [ADDRESSES.ENTRYPOINT_V08, ownerAddr]);
  await account.waitForDeployment();
  const accountAddr = await account.getAddress();

  // 6. Fund account with A7A5; approve ParaSwap (swap input) and paymaster (gas).
  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_GAS_FUNDING);
  await approveFromAccount(account, owner, ADDRESSES.A7A5, paraSwapAddr);
  await approveFromAccount(account, owner, ADDRESSES.A7A5, paymasterAddr);

  return {
    deployer,
    owner,
    bundler,
    deployerAddr,
    ownerAddr,
    facade,
    facadeAddr,
    paraSwap,
    paraSwapAddr,
    twap,
    twapAddr,
    oracle,
    oracleAddr,
    entryPoint,
    paymaster,
    paymasterAddr,
    account,
    accountAddr,
  };
}

/** Approve `spender` to move `token` from the smart account, driven by the owner. */
export async function approveFromAccount(account: any, owner: any, token: string, spender: string): Promise<void> {
  const data = new ethers.Interface(ERC20_APPROVE_ABI).encodeFunctionData('approve', [spender, ethers.MaxUint256]);
  await (await account.connect(owner).execute(token, 0, data)).wait();
}

/** Grow the pool's observation buffer and write a few observations across time. */
async function warmUpTwap(deployer: any, facade: any, facadeAddr: string, deployerAddr: string): Promise<void> {
  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, V3_POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();

  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, deployerAddr, USDT_POKE * 10n);
  const usdt = IA7A5__factory.connect(ADDRESSES.USDT, deployer);
  await (await (usdt as any).approve(facadeAddr, USDT_POKE * 10n)).wait();

  // Each swap in a fresh block writes one observation; space them past the TWAP window.
  for (let i = 0; i < 3; i++) {
    await networkHelpers.time.increase(45);
    await (await facade.connect(deployer).swapWA7A5(USDT_POKE, SIDE.BUY, 0n, FAR_DEADLINE)).wait();
  }
  await networkHelpers.time.increase(5);
}
