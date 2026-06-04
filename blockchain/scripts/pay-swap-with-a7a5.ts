// End-to-end demo: a user swaps A7A5 -> USDT through ParaSwap while paying gas in A7A5 via the
// A7A5 paymaster. Deploys the full stack on a mainnet fork, warms up the TWAP oracle, builds and
// signs a real ERC-4337 UserOperation, and submits it through the canonical EntryPoint.
//
//   ALCHEMY_API_KEY=... npx hardhat run scripts/pay-swap-with-a7a5.ts
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';
import {ENTRYPOINT_ABI, buildSignedUserOp} from '../common/erc4337.js';

const conn = await network.create('hardhat');
const {ethers, networkHelpers} = conn;

const TWAP_WINDOW = 60;
const MAX_STALENESS = 2 * 24 * 60 * 60;
const A7A5_FUNDING = 5_000_000_000n; // 5,000 A7A5
const A7A5_SWAP_IN = 1_000_000_000n; // 1,000 A7A5
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
const ACCOUNT_ABI = ['function execute(address target, uint256 value, bytes data) returns (bytes)'];
const POOL_ABI = ['function increaseObservationCardinalityNext(uint16)'];

const fmt6 = (v: bigint) => ethers.formatUnits(v, 6);

async function impersonate(addr: string) {
  await networkHelpers.setBalance(addr, ethers.parseEther('100'));
  return ethers.getImpersonatedSigner(addr);
}
async function fundFromWhale(token: string, whale: string, to: string, amount: bigint) {
  const holder = await impersonate(whale);
  await (await new ethers.Contract(token, ERC20, holder).transfer(to, amount)).wait();
}

async function main() {
  const [deployer, ownerSigner, bundler] = await ethers.getSigners();
  const owner = await deployer.getAddress();
  const ownerAddr = await ownerSigner.getAddress();

  // ── Deploy swap + oracle + paymaster + account ──────────────────────────────
  const facade = await ethers.deployContract('PoolsFacade', [
    ADDRESSES.WA7A5, ADDRESSES.A7A5, ADDRESSES.USDT,
    ADDRESSES.V2_PAIR_USDT_A7A5, ADDRESSES.SWAP_ROUTER_02, ADDRESSES.QUOTER_V2, ADDRESSES.V3_FEE_TIER,
  ]);
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();

  const paraSwap = await ethers.deployContract('ParaSwap', [facadeAddr, ADDRESSES.SWAP_ROUTER_02]);
  await paraSwap.waitForDeployment();
  const paraSwapAddr = await paraSwap.getAddress();

  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.WA7A5, ADDRESSES.USDT, TWAP_WINDOW, owner,
  ]);
  await twap.waitForDeployment();
  const oracle = await ethers.deployContract('A7A5NativeOracle', [
    await twap.getAddress(), ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.WA7A5, MAX_STALENESS, owner,
  ]);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();

  // Warm up the V3 observation buffer.
  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();
  await fundFromWhale(ADDRESSES.USDT, ADDRESSES.USDT_WHALE, owner, USDT_POKE * 10n);
  await (await new ethers.Contract(ADDRESSES.USDT, ERC20, deployer).approve(facadeAddr, USDT_POKE * 10n)).wait();
  for (let i = 0; i < 3; i++) {
    await networkHelpers.time.increase(45);
    await (await facade.connect(deployer).swapWA7A5(USDT_POKE, 0, 0n, FAR_DEADLINE)).wait();
  }

  const entryPoint = new ethers.Contract(ADDRESSES.ENTRYPOINT_V08, ENTRYPOINT_ABI, deployer);
  const paymaster = await ethers.deployContract('A7A5Paymaster', [ADDRESSES.ENTRYPOINT_V08, ADDRESSES.A7A5, oracleAddr, owner]);
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();
  await (await (paymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (paymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const account = await ethers.deployContract('SimpleA7A5Account', [ADDRESSES.ENTRYPOINT_V08, ownerAddr]);
  await account.waitForDeployment();
  const accountAddr = await account.getAddress();

  // Fund account with A7A5 and approve ParaSwap (swap) + paymaster (gas).
  await fundFromWhale(ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_FUNDING);
  for (const spender of [paraSwapAddr, paymasterAddr]) {
    const data = new ethers.Interface(ERC20).encodeFunctionData('approve', [spender, ethers.MaxUint256]);
    await (await (account as any).connect(ownerSigner).execute(ADDRESSES.A7A5, 0, data)).wait();
  }

  // ── Build, sign and submit the sponsored swap ───────────────────────────────
  const a7a5 = new ethers.Contract(ADDRESSES.A7A5, ERC20, ethers.provider);
  const usdt = new ethers.Contract(ADDRESSES.USDT, ERC20, ethers.provider);
  const [price] = await (oracle as any).tokenPriceData();
  console.log(`tokenPrice (A7A5 base units per ETH): ${price}`);

  const a7a5Before: bigint = await a7a5.balanceOf(accountAddr);
  const usdtBefore: bigint = await usdt.balanceOf(accountAddr);
  const pmA7A5Before: bigint = await a7a5.balanceOf(paymasterAddr);
  const accEthBefore: bigint = await ethers.provider.getBalance(accountAddr);

  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_SWAP_IN, 0n, ADDRESSES.V3_FEE_TIER, FAR_DEADLINE,
  ]);
  const callData = new ethers.Interface(ACCOUNT_ABI).encodeFunctionData('execute', [paraSwapAddr, 0, swapData]);

  const op = await buildSignedUserOp(ethers as any, entryPoint as any, ownerSigner as any, {
    sender: accountAddr,
    callData,
    paymaster: paymasterAddr,
  });
  await (await (entryPoint as any).connect(bundler).handleOps([op], owner)).wait();

  const a7a5After: bigint = await a7a5.balanceOf(accountAddr);
  const usdtAfter: bigint = await usdt.balanceOf(accountAddr);
  const pmA7A5After: bigint = await a7a5.balanceOf(paymasterAddr);
  const accEthAfter: bigint = await ethers.provider.getBalance(accountAddr);

  console.log('\n── Result ─────────────────────────────────────────────');
  console.log(`account USDT received:   +${fmt6(usdtAfter - usdtBefore)} USDT`);
  console.log(`account A7A5 spent:      -${fmt6(a7a5Before - a7a5After)} A7A5 (swap ${fmt6(A7A5_SWAP_IN)} + gas)`);
  console.log(`paymaster A7A5 gas fee:  +${fmt6(pmA7A5After - pmA7A5Before)} A7A5`);
  console.log(`account ETH spent:        ${ethers.formatEther(accEthBefore - accEthAfter)} ETH (expected 0)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
