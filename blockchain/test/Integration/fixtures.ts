import {ADDRESSES} from '../../common/addresses.js';
import {ENTRYPOINT_ABI, defaultApprovals, encodeInitializeWebAuthn} from '../../common/erc4337.js';
import {fundFromWhale} from '../helpers.js';
import {approveFromAccount} from '../Paymaster/fixtures.js';
import {conn, ethers, SIDE, TWAP_WINDOW, MAX_STALENESS, A7A5_GAS_FUNDING, USDT_POKE, V3_POOL_ABI, FAR_DEADLINE} from '../Paymaster/consts.js';
import {testP256PublicKey} from '../A7A5WebAuthnAccount/webauthn-helpers.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const USDT_GAS_FUNDING = 500_000_000n; // 500 USDT

/** Re-export warm-up helper surface for integration tests. */
export {approveFromAccount};

/**
 * Deploy the full AA + swap stack: ParaSwap, both oracles, both paymasters, WebAuthn factory,
 * and a counterfactual WebAuthn account funded with A7A5 + USDT.
 */
export async function deployAAStackFixture() {
  const [deployer, owner, bundler] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const ownerAddr = await owner.getAddress();

  const facade = await ethers.deployContract('PoolsFacade', [
    ADDRESSES.WA7A5,
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
    ADDRESSES.V2_PAIR_USDT_A7A5,
    ADDRESSES.SWAP_ROUTER_02,
    ADDRESSES.QUOTER_V2,
    ADDRESSES.V3_FEE_TIER,
    deployerAddr,
  ]);
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();

  const paraSwap = await ethers.deployContract('ParaSwap', [facadeAddr, ADDRESSES.SWAP_ROUTER_02, deployerAddr]);
  await paraSwap.waitForDeployment();
  const paraSwapAddr = await paraSwap.getAddress();

  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5,
    ADDRESSES.WA7A5,
    ADDRESSES.USDT,
    TWAP_WINDOW,
    deployerAddr,
  ]);
  await twap.waitForDeployment();
  const twapAddr = await twap.getAddress();

  const a7a5Oracle = await ethers.deployContract('A7A5NativeOracle', [
    twapAddr,
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    deployerAddr,
  ]);
  await a7a5Oracle.waitForDeployment();
  const a7a5OracleAddr = await a7a5Oracle.getAddress();

  const usdtOracle = await ethers.deployContract('UsdtNativeOracle', [ADDRESSES.CHAINLINK_USDT_ETH, MAX_STALENESS, deployerAddr]);
  await usdtOracle.waitForDeployment();
  const usdtOracleAddr = await usdtOracle.getAddress();

  await warmUpTwap(deployer, facade, facadeAddr, deployerAddr);

  const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, ENTRYPOINT_ABI, deployer);

  const a7a5Paymaster = await ethers.deployContract('A7A5Paymaster', [ADDRESSES.ENTRYPOINT_V08, ADDRESSES.A7A5, a7a5OracleAddr, deployerAddr]);
  await a7a5Paymaster.waitForDeployment();
  const a7a5PaymasterAddr = await a7a5Paymaster.getAddress();
  await (await (a7a5Paymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (a7a5Paymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const usdtPaymaster = await ethers.deployContract('UsdtPaymaster', [ADDRESSES.ENTRYPOINT_V08, ADDRESSES.USDT, usdtOracleAddr, deployerAddr]);
  await usdtPaymaster.waitForDeployment();
  const usdtPaymasterAddr = await usdtPaymaster.getAddress();
  await (await (usdtPaymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (usdtPaymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const accountImpl = await ethers.deployContract('A7A5WebAuthnAccount', [ADDRESSES.ENTRYPOINT_V08]);
  await accountImpl.waitForDeployment();
  const accountImplAddr = await accountImpl.getAddress();

  const eip7702Delegate = await ethers.deployContract('A7A5EIP7702Account', [ADDRESSES.ENTRYPOINT_V08]);
  await eip7702Delegate.waitForDeployment();
  const eip7702DelegateAddr = await eip7702Delegate.getAddress();

  const factory = await ethers.deployContract('A7A5AccountFactory', [
    accountImplAddr,
    eip7702DelegateAddr,
    [facadeAddr, paraSwapAddr, a7a5PaymasterAddr, usdtPaymasterAddr],
  ]);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();

  const accountApprovals = defaultApprovals({
    a7a5: ADDRESSES.A7A5,
    wa7a5: ADDRESSES.WA7A5,
    usdt: ADDRESSES.USDT,
    poolsFacade: facadeAddr,
    paraSwap: paraSwapAddr,
    a7a5Paymaster: a7a5PaymasterAddr,
    usdtPaymaster: usdtPaymasterAddr,
  });

  const {qx, qy} = testP256PublicKey();
  const initCalldata = encodeInitializeWebAuthn(ethers as any, qx, qy);
  const accountAddr: string = await (factory as any).predictAddress(initCalldata);
  await (
    await (factory as any).cloneAndInitializeWithApprovals(
      initCalldata,
      accountApprovals.map((a) => [a.token, a.spender, a.amount]),
    )
  ).wait();
  const account = await ethers.getContractAt('A7A5WebAuthnAccount', accountAddr);

  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_GAS_FUNDING);
  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, accountAddr, USDT_GAS_FUNDING);

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
    a7a5Oracle,
    a7a5OracleAddr,
    usdtOracle,
    usdtOracleAddr,
    entryPoint,
    a7a5Paymaster,
    a7a5PaymasterAddr,
    usdtPaymaster,
    usdtPaymasterAddr,
    accountImpl,
    accountImplAddr,
    eip7702Delegate,
    eip7702DelegateAddr,
    factory,
    factoryAddr,
    account,
    accountAddr,
    accountApprovals,
    initCalldata,
    qx,
    qy,
  };
}

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

const ERC7821_BATCH_MODE = '0x0100000000000000000000000000000000000000000000000000000000000000';

/** Approve via ERC-7821 execute, called as the EntryPoint (authorized executor). */
export async function approveErc7821(account: any, token: string, spender: string): Promise<void> {
  const data = new ethers.Interface(ERC20_APPROVE_ABI).encodeFunctionData('approve', [spender, ethers.MaxUint256]);
  const executionData = ethers.AbiCoder.defaultAbiCoder().encode(['tuple(address target, uint256 value, bytes callData)[]'], [[[token, 0n, data]]]);
  const ep = await ethers.getImpersonatedSigner(ADDRESSES.ENTRYPOINT_V08);
  await conn.networkHelpers.setBalance(ADDRESSES.ENTRYPOINT_V08, ethers.parseEther('1'));
  await (await account.connect(ep).execute(ERC7821_BATCH_MODE, executionData, {gasLimit: 500_000})).wait();
}

async function warmUpTwap(deployer: any, facade: any, facadeAddr: string, deployerAddr: string): Promise<void> {
  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, V3_POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();

  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, deployerAddr, USDT_POKE * 10n);
  const usdt = IA7A5__factory.connect(ADDRESSES.USDT, deployer);
  await (await (usdt as any).approve(facadeAddr, USDT_POKE * 10n)).wait();

  for (let i = 0; i < 3; i++) {
    await conn.networkHelpers.time.increase(110);
    await (await facade.connect(deployer).swapWA7A5(USDT_POKE, SIDE.BUY, 0n, FAR_DEADLINE)).wait();
  }
  await conn.networkHelpers.time.increase(5);
}
