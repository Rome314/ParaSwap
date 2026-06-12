import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildSignedUserOp} from '../../common/erc4337.js';
import {fundFromWhale, forkReady, formatUnits6} from '../helpers.js';
import {approveFromAccount} from '../Paymaster/fixtures.js';
import {conn, ethers, networkHelpers, loadFixture, MAX_STALENESS, FAR_DEADLINE} from '../Paymaster/consts.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';
import {deployPaymasterStackFixture} from '../Paymaster/fixtures.js';

const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];
const ACCOUNT_ABI = ['function execute(address target, uint256 value, bytes data) returns (bytes)'];

const USDT_SWAP_IN = 100_000_000n; // 100 USDT
const USDT_GAS_FUNDING = 500_000_000n;

function usdt(provider: any) {
  return IA7A5__factory.connect(ADDRESSES.USDT, provider);
}

async function deployUsdtPaymasterStack() {
  const base = await deployPaymasterStackFixture();

  const usdtOracle = await ethers.deployContract('UsdtNativeOracle', [
    ADDRESSES.CHAINLINK_USDT_ETH,
    MAX_STALENESS,
    base.deployerAddr,
  ]);
  await usdtOracle.waitForDeployment();
  const usdtOracleAddr = await usdtOracle.getAddress();

  const usdtPaymaster = await ethers.deployContract('UsdtPaymaster', [
    ADDRESSES.ENTRYPOINT_V08,
    ADDRESSES.USDT,
    usdtOracleAddr,
    base.deployerAddr,
  ]);
  await usdtPaymaster.waitForDeployment();
  const usdtPaymasterAddr = await usdtPaymaster.getAddress();
  await (await (usdtPaymaster as any).deposit({value: ethers.parseEther('5')})).wait();
  await (await (usdtPaymaster as any).addStake(86_400, {value: ethers.parseEther('1')})).wait();

  const account = await ethers.deployContract('SimpleA7A5Account', [ADDRESSES.ENTRYPOINT_V08, base.ownerAddr]);
  await account.waitForDeployment();
  const accountAddr = await account.getAddress();

  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, accountAddr, USDT_GAS_FUNDING);
  await approveFromAccount(account, base.owner, ADDRESSES.USDT, base.paraSwapAddr);
  await approveFromAccount(account, base.owner, ADDRESSES.USDT, usdtPaymasterAddr);

  return {...base, usdtOracle, usdtOracleAddr, usdtPaymaster, usdtPaymasterAddr, account, accountAddr};
}

function buildUsdtSwapCallData(paraSwapAddr: string): string {
  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    ADDRESSES.USDT,
    ADDRESSES.A7A5,
    USDT_SWAP_IN,
    0n,
    ADDRESSES.V3_FEE_TIER,
    FAR_DEADLINE,
  ]);
  return new ethers.Interface(ACCOUNT_ABI).encodeFunctionData('execute', [paraSwapAddr, 0, swapData]);
}

const run = forkReady(ADDRESSES.USDT, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.ENTRYPOINT_V08);

(run ? describe : describe.skip)('UsdtPaymaster', function () {
  this.timeout(180_000);

  describe('Oracle', function () {
    it('returns a positive tokenPrice valid into the future', async function () {
      const {usdtOracle} = await loadFixture(deployUsdtPaymasterStack);
      const [price, validUntil] = await (usdtOracle as any).tokenPriceData();
      console.log(`Oracle price: ${formatUnits6(price)} USDT per ETH`);
      console.log(`Oracle validUntil: ${new Date(Number(validUntil) * 1000).toISOString()}`);
      expect(price).to.be.greaterThan(0n);
      const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
      expect(validUntil).to.be.greaterThan(now);
      expect(await (usdtOracle as any).tokenPrice()).to.equal(price);
    });

    it('reverts the convenience price once the Chainlink answer is stale', async function () {
      const {usdtOracle} = await loadFixture(deployUsdtPaymasterStack);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      await expect((usdtOracle as any).tokenPrice()).to.be.revertedWithCustomError(usdtOracle, 'UsdtNativeOracle__StalePrice');
    });
  });

  describe('Access control', function () {
    it('allows withdrawal by the owner', async function () {
      const {usdtPaymaster, deployer, ownerAddr, entryPoint, usdtPaymasterAddr} =
        await loadFixture(deployUsdtPaymasterStack);

      const WITHDRAW_AMOUNT = ethers.parseEther('1');
      const recipientEthBefore = await ethers.provider.getBalance(ownerAddr);
      const pmDepositBefore    = await (entryPoint as any).balanceOf(usdtPaymasterAddr);

      await (await (usdtPaymaster as any).connect(deployer).withdraw(ownerAddr, WITHDRAW_AMOUNT)).wait();

      const recipientEthAfter = await ethers.provider.getBalance(ownerAddr);
      const pmDepositAfter    = await (entryPoint as any).balanceOf(usdtPaymasterAddr);

      expect(recipientEthAfter - recipientEthBefore).to.equal(WITHDRAW_AMOUNT);
      expect(pmDepositBefore - pmDepositAfter).to.equal(WITHDRAW_AMOUNT);
    });

    it('only the owner can withdraw the EntryPoint deposit', async function () {
      const {usdtPaymaster, owner, ownerAddr} = await loadFixture(deployUsdtPaymasterStack);
      await expect((usdtPaymaster as any).connect(owner).withdraw(ownerAddr, 1n))
        .to.be.revertedWithCustomError(usdtPaymaster, 'OwnableUnauthorizedAccount');
    });

    it('only the owner can pause', async function () {
      const {usdtPaymaster, owner} = await loadFixture(deployUsdtPaymasterStack);
      await expect((usdtPaymaster as any).connect(owner).pause())
        .to.be.revertedWithCustomError(usdtPaymaster, 'OwnableUnauthorizedAccount');
    });
  });

  describe('End-to-end: gas paid in USDT', function () {
    it('executes USDT → A7A5 swap with zero ETH spent by account', async function () {
      const f = await loadFixture(deployUsdtPaymasterStack);

      const a7a5Token = IA7A5__factory.connect(ADDRESSES.A7A5, ethers.provider);

      const accA7A5Before:   bigint = await a7a5Token.balanceOf(f.accountAddr);
      const accUsdtBefore:   bigint = await usdt(ethers.provider).balanceOf(f.accountAddr);
      const accEthBefore:    bigint = await ethers.provider.getBalance(f.accountAddr);
      const pmUsdtBefore:    bigint = await usdt(ethers.provider).balanceOf(f.usdtPaymasterAddr);
      const pmDepositBefore: bigint = await (f.entryPoint as any).balanceOf(f.usdtPaymasterAddr);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildUsdtSwapCallData(f.paraSwapAddr),
        paymaster: f.usdtPaymasterAddr,
      });
      await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

      const accA7A5After:   bigint = await a7a5Token.balanceOf(f.accountAddr);
      const accUsdtAfter:   bigint = await usdt(ethers.provider).balanceOf(f.accountAddr);
      const accEthAfter:    bigint = await ethers.provider.getBalance(f.accountAddr);
      const pmUsdtAfter:    bigint = await usdt(ethers.provider).balanceOf(f.usdtPaymasterAddr);
      const pmDepositAfter: bigint = await (f.entryPoint as any).balanceOf(f.usdtPaymasterAddr);

      const gasInUsdt = pmUsdtAfter - pmUsdtBefore;
      const gasInEth  = pmDepositBefore - pmDepositAfter;

      console.log('  ── Before ────────────────────────────────────────────');
      console.log(`  Account  A7A5:      ${formatUnits6(accA7A5Before)}`);
      console.log(`  Account  USDT:      ${formatUnits6(accUsdtBefore)}`);
      console.log(`  Account  ETH:       ${ethers.formatEther(accEthBefore)} ETH`);
      console.log(`  Paymaster USDT:     ${formatUnits6(pmUsdtBefore)}`);
      console.log(`  Paymaster deposit:  ${ethers.formatEther(pmDepositBefore)} ETH`);
      console.log('  ── After ─────────────────────────────────────────────');
      console.log(`  Account  A7A5:      ${formatUnits6(accA7A5After)}`);
      console.log(`  Account  USDT:      ${formatUnits6(accUsdtAfter)}`);
      console.log(`  Account  ETH:       ${ethers.formatEther(accEthAfter)} ETH`);
      console.log(`  Paymaster USDT:     ${formatUnits6(pmUsdtAfter)}`);
      console.log(`  Paymaster deposit:  ${ethers.formatEther(pmDepositAfter)} ETH`);
      console.log('  ── Deltas ────────────────────────────────────────────');
      console.log(`  A7A5 received:       +${formatUnits6(accA7A5After - accA7A5Before)}`);
      console.log(`  USDT lost:           -${formatUnits6(accUsdtBefore - accUsdtAfter)}  (swap=${formatUnits6(USDT_SWAP_IN)} + gas=${formatUnits6(gasInUsdt)})`);
      console.log(`  Paymaster USDT gain: +${formatUnits6(gasInUsdt)}`);
      console.log(`  Paymaster ETH spent: -${ethers.formatEther(gasInEth)} ETH`);

      expect(accA7A5After).to.be.greaterThan(accA7A5Before);
      expect(accUsdtAfter).to.be.lessThan(accUsdtBefore);
      expect(accEthAfter).to.equal(accEthBefore);
      expect(pmUsdtAfter).to.be.greaterThan(pmUsdtBefore);
      expect(pmDepositBefore).to.be.greaterThan(pmDepositAfter);
      // Cross-math: every USDT wei the account lost = swap input + gas the paymaster kept.
      expect(accUsdtBefore - accUsdtAfter).to.equal(USDT_SWAP_IN + gasInUsdt);
    });
  });

  describe('Rejections', function () {
    it('rejects when paymaster is paused', async function () {
      const f = await loadFixture(deployUsdtPaymasterStack);
      await (await (f.usdtPaymaster as any).connect(f.deployer).pause()).wait();

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildUsdtSwapCallData(f.paraSwapAddr),
        paymaster: f.usdtPaymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });

    it('rejects when oracle price is stale', async function () {
      const f = await loadFixture(deployUsdtPaymasterStack);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildUsdtSwapCallData(f.paraSwapAddr),
        paymaster: f.usdtPaymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });

    it('rejects the op when the account has not approved the paymaster for USDT', async function () {
      const f = await loadFixture(deployUsdtPaymasterStack);

      const account = await ethers.deployContract('SimpleA7A5Account', [ADDRESSES.ENTRYPOINT_V08, f.ownerAddr]);
      await account.waitForDeployment();
      const accountAddr = await account.getAddress();
      await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, accountAddr, USDT_GAS_FUNDING);
      await approveFromAccount(account, f.owner, ADDRESSES.USDT, f.paraSwapAddr);
      // Intentionally NOT approving usdtPaymasterAddr.

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: accountAddr,
        callData: buildUsdtSwapCallData(f.paraSwapAddr),
        paymaster: f.usdtPaymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });
  });
});

describe('UsdtPaymaster (unit, no fork)', function () {
  this.timeout(60_000);

  async function deployUsdtPaymasterUnit() {
    const [deployer] = await ethers.getSigners();

    const usdtToken = await ethers.deployContract('MockToken', [6]);
    await usdtToken.waitForDeployment();

    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    const feed = await ethers.deployContract('MockChainlinkFeed', [400_000_000_000_000n, now, 18]);
    await feed.waitForDeployment();

    const mockEP = await ethers.deployContract('MockEntryPoint');
    await mockEP.waitForDeployment();

    const oracle = await ethers.deployContract('UsdtNativeOracle', [
      await feed.getAddress(),
      5 * 60,
      await deployer.getAddress(),
    ]);
    await oracle.waitForDeployment();

    const paymaster = await ethers.deployContract('UsdtPaymaster', [
      await mockEP.getAddress(),
      await usdtToken.getAddress(),
      await oracle.getAddress(),
      await deployer.getAddress(),
    ]);
    await paymaster.waitForDeployment();

    return {deployer, usdtToken, oracle, paymaster};
  }

  it('constructor reverts on zero entryPoint', async function () {
    const [deployer] = await ethers.getSigners();
    const t = await ethers.deployContract('MockToken', [6]);
    await t.waitForDeployment();
    const oracle = await ethers.deployContract('MockToken', [6]);
    await oracle.waitForDeployment();
    const ZERO = ethers.ZeroAddress;
    await expect(
      ethers.deployContract('UsdtPaymaster', [ZERO, await t.getAddress(), await oracle.getAddress(), deployer.address]),
    ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('UsdtPaymaster')).interface} as any, 'UsdtPaymaster__ZeroAddress');
  });

  it('constructor reverts when usdt is the zero address', async function () {
    const [deployer] = await ethers.getSigners();
    const ep = await ethers.deployContract('MockEntryPoint');
    await ep.waitForDeployment();
    const oracle = await ethers.deployContract('MockToken', [6]);
    await oracle.waitForDeployment();
    await expect(
      ethers.deployContract('UsdtPaymaster', [await ep.getAddress(), ethers.ZeroAddress, await oracle.getAddress(), deployer.address]),
    ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('UsdtPaymaster')).interface} as any, 'UsdtPaymaster__ZeroAddress');
  });

  it('setOracle updates the oracle address and emits OracleUpdated', async function () {
    const {deployer, oracle, paymaster} = await deployUsdtPaymasterUnit();

    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    const feed = await ethers.deployContract('MockChainlinkFeed', [400_000_000_000_000n, now, 18]);
    await feed.waitForDeployment();
    const newOracle = await ethers.deployContract('UsdtNativeOracle', [
      await feed.getAddress(),
      5 * 60,
      await deployer.getAddress(),
    ]);
    await newOracle.waitForDeployment();

    const oldAddr = await oracle.getAddress();
    const newAddr = await newOracle.getAddress();

    await expect((paymaster as any).connect(deployer).setOracle(newOracle))
      .to.emit(paymaster, 'OracleUpdated')
      .withArgs(oldAddr, newAddr);
    expect(await (paymaster as any).oracle()).to.equal(newAddr);
  });

  it('setOracle reverts when new oracle is the zero address', async function () {
    const {deployer, paymaster} = await deployUsdtPaymasterUnit();
    await expect((paymaster as any).connect(deployer).setOracle(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(paymaster, 'UsdtPaymaster__ZeroAddress');
  });

  it('unpause restores the unpaused state after pause', async function () {
    const {deployer, paymaster} = await deployUsdtPaymasterUnit();

    expect(await (paymaster as any).paused()).to.equal(false);
    await (await (paymaster as any).connect(deployer).pause()).wait();
    expect(await (paymaster as any).paused()).to.equal(true);
    await (await (paymaster as any).connect(deployer).unpause()).wait();
    expect(await (paymaster as any).paused()).to.equal(false);
  });
});
