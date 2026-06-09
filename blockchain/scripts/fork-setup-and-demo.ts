// Deploys the full AA stack on a mainnet fork and runs A7A5-gas + USDT-gas demo swaps.
// Prints deployed addresses JSON for frontend .env configuration.
//
//   ALCHEMY_API_KEY=... npx hardhat run scripts/fork-setup-and-demo.ts
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';
import {
  ENTRYPOINT_ABI,
  buildErc7821ExecuteCalldata,
  buildWebAuthnSignedUserOp,
  encodeInitializeWebAuthn,
} from '../common/erc4337.js';
import {signUserOpHashWebAuthn, testP256PublicKey} from '../test/A7A5WebAuthnAccount/webauthn-helpers.js';

const conn = await network.create('hardhat');
const {ethers, networkHelpers} = conn;

const TWAP_WINDOW = 60;
const MAX_STALENESS = 2 * 24 * 60 * 60;
const A7A5_FUNDING = 5_000_000_000n;
const A7A5_SWAP_IN = 1_000_000_000n;
const USDT_FUNDING = 500_000_000n;
const USDT_SWAP_IN = 100_000_000n;
const USDT_POKE = 1_000_000n;
const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);

const ERC20 = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];
const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];
const POOL_ABI = ['function increaseObservationCardinalityNext(uint16)'];

async function impersonate(addr: string) {
  await networkHelpers.setBalance(addr, ethers.parseEther('100'));
  return ethers.getImpersonatedSigner(addr);
}
async function fundFromWhale(token: string, whale: string, to: string, amount: bigint) {
  const holder = await impersonate(whale);
  await (await new ethers.Contract(token, ERC20, holder).transfer(to, amount)).wait();
}

async function approveAsEntryPoint(account: any, token: string, spender: string) {
  const data = new ethers.Interface(ERC20).encodeFunctionData('approve', [spender, ethers.MaxUint256]);
  const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(address target, uint256 value, bytes callData)[]'],
    [[[token, 0n, data]]],
  );
  const ep = await ethers.getImpersonatedSigner(ADDRESSES.ENTRYPOINT_V08);
  await networkHelpers.setBalance(ADDRESSES.ENTRYPOINT_V08, ethers.parseEther('1'));
  const mode = '0x0100000000000000000000000000000000000000000000000000000000000000';
  await (await account.connect(ep).execute(mode, executionData)).wait();
}

function buildSwapCallData(paraSwapAddr: string, tokenIn: string, tokenOut: string, amountIn: bigint): string {
  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    tokenIn,
    tokenOut,
    amountIn,
    0n,
    ADDRESSES.V3_FEE_TIER,
    FAR_DEADLINE,
  ]);
  return buildErc7821ExecuteCalldata(ethers as any, paraSwapAddr, 0n, swapData);
}

async function main() {
  const [deployer, bundler] = await ethers.getSigners();
  const owner = await deployer.getAddress();

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

  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5,
    ADDRESSES.WA7A5,
    ADDRESSES.USDT,
    TWAP_WINDOW,
    owner,
  ]);
  await twap.waitForDeployment();

  const a7a5Oracle = await ethers.deployContract('A7A5NativeOracle', [
    await twap.getAddress(),
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    owner,
  ]);
  await a7a5Oracle.waitForDeployment();

  const usdtOracle = await ethers.deployContract('UsdtNativeOracle', [ADDRESSES.CHAINLINK_USDT_ETH, MAX_STALENESS, owner]);
  await usdtOracle.waitForDeployment();

  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();
  await fundFromWhale(ADDRESSES.USDT, ADDRESSES.USDT_WHALE, owner, USDT_POKE * 10n);
  await (await new ethers.Contract(ADDRESSES.USDT, ERC20, deployer).approve(facadeAddr, USDT_POKE * 10n)).wait();
  for (let i = 0; i < 3; i++) {
    await networkHelpers.time.increase(45);
    await (await facade.connect(deployer).swapWA7A5(USDT_POKE, 0, 0n, FAR_DEADLINE)).wait();
  }

  const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, ENTRYPOINT_ABI, deployer);

  const a7a5Paymaster = await ethers.deployContract('A7A5Paymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.A7A5,
    await a7a5Oracle.getAddress(),
    owner,
  ]);
  await a7a5Paymaster.waitForDeployment();
  await (await (a7a5Paymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (a7a5Paymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const usdtPaymaster = await ethers.deployContract('UsdtPaymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.USDT,
    await usdtOracle.getAddress(),
    owner,
  ]);
  await usdtPaymaster.waitForDeployment();
  await (await (usdtPaymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (usdtPaymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const accountImpl = await ethers.deployContract('A7A5WebAuthnAccount', [ADDRESSES.ENTRYPOINT_V08]);
  await accountImpl.waitForDeployment();
  const factory = await ethers.deployContract('A7A5AccountFactory', [await accountImpl.getAddress()]);
  await factory.waitForDeployment();

  const {qx, qy} = testP256PublicKey();
  const initCalldata = encodeInitializeWebAuthn(ethers as any, qx, qy);
  const account = await ethers.getContractAt(
    'A7A5WebAuthnAccount',
    await (factory as any).cloneAndInitialize(initCalldata),
  );
  const accountAddr = await account.getAddress();

  await fundFromWhale(ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_FUNDING);
  await fundFromWhale(ADDRESSES.USDT, ADDRESSES.USDT_WHALE, accountAddr, USDT_FUNDING);
  for (const [token, spender] of [
    [ADDRESSES.A7A5, paraSwapAddr],
    [ADDRESSES.A7A5, await a7a5Paymaster.getAddress()],
    [ADDRESSES.USDT, paraSwapAddr],
    [ADDRESSES.USDT, await usdtPaymaster.getAddress()],
  ] as const) {
    await approveAsEntryPoint(account, token, spender);
  }

  const addresses = {
    entryPoint: ADDRESSES.ENTRYPOINT_V08,
    paraSwap: paraSwapAddr,
    poolsFacade: facadeAddr,
    a7a5Paymaster: await a7a5Paymaster.getAddress(),
    usdtPaymaster: await usdtPaymaster.getAddress(),
    accountFactory: await factory.getAddress(),
    accountImpl: await accountImpl.getAddress(),
    webAuthnAccount: accountAddr,
    a7a5TwapOracle: await twap.getAddress(),
    a7a5NativeOracle: await a7a5Oracle.getAddress(),
    usdtNativeOracle: await usdtOracle.getAddress(),
  };

  console.log('\n── Deployed AA stack ─────────────────────────────────');
  console.log(JSON.stringify(addresses, null, 2));

  const a7a5Op = await buildWebAuthnSignedUserOp(
    ethers as any,
    entryPoint as any,
    {
      sender: accountAddr,
      callData: buildSwapCallData(paraSwapAddr, ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN),
      paymaster: addresses.a7a5Paymaster,
    },
    signUserOpHashWebAuthn,
  );
  await (entryPoint as any).connect(bundler).handleOps([a7a5Op], owner);
  console.log('✓ A7A5-gas swap demo complete');

  const usdtOp = await buildWebAuthnSignedUserOp(
    ethers as any,
    entryPoint as any,
    {
      sender: accountAddr,
      callData: buildSwapCallData(paraSwapAddr, ADDRESSES.USDT, ADDRESSES.A7A5, USDT_SWAP_IN),
      paymaster: addresses.usdtPaymaster,
    },
    signUserOpHashWebAuthn,
  );
  await (entryPoint as any).connect(bundler).handleOps([usdtOp], owner);
  console.log('✓ USDT-gas swap demo complete');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
