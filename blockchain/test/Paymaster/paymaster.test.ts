import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildSignedUserOp} from '../../common/erc4337.js';
import {fundFromWhale, forkReady, formatUnits6} from '../helpers.js';
import {conn, ethers, networkHelpers, loadFixture, A7A5_SWAP_IN, A7A5_GAS_FUNDING, MAX_STALENESS, FAR_DEADLINE} from './consts.js';
import {deployPaymasterStackFixture, approveFromAccount} from './fixtures.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

const PARASWAP_ABI = [
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint24 fee, uint256 deadline) returns (uint256)',
];
const ACCOUNT_ABI = ['function execute(address target, uint256 value, bytes data) returns (bytes)'];

function a7a5(signerOrProvider: any) {
  return IA7A5__factory.connect(ADDRESSES.A7A5, signerOrProvider);
}
function usdt(signerOrProvider: any) {
  return IA7A5__factory.connect(ADDRESSES.USDT, signerOrProvider);
}

/** Encode `account.execute(paraSwap, 0, swap(A7A5 -> USDT))`. */
function buildSwapCallData(paraSwapAddr: string): string {
  const swapData = new ethers.Interface(PARASWAP_ABI).encodeFunctionData('swap', [
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
    A7A5_SWAP_IN,
    0n,
    ADDRESSES.V3_FEE_TIER,
    FAR_DEADLINE,
  ]);
  return new ethers.Interface(ACCOUNT_ABI).encodeFunctionData('execute', [paraSwapAddr, 0, swapData]);
}

// Fork-only: needs the real EntryPoint, Chainlink feed, A7A5 pools and whales.
const run = forkReady(ADDRESSES.A7A5, ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.ENTRYPOINT_V08);

(run ? describe : describe.skip)('A7A5 paymaster', function () {
  this.timeout(180_000);

  describe('Oracle', function () {
    it('A7A5/USDT TWAP returns a positive 8-decimal price', async function () {
      const {twap} = await loadFixture(deployPaymasterStackFixture);
      const answer: bigint = await (twap as any).latestAnswer();
      console.log(`  USDT/A7A5 TWAP: ${formatUnits6(100_000_000_000_000n / answer)} A7A5 per USDT`);
      expect(answer).to.be.greaterThan(0n);
      expect(await (twap as any).decimals()).to.equal(8n);
    });

    it('native oracle yields a positive tokenPrice valid into the future', async function () {
      const {oracle} = await loadFixture(deployPaymasterStackFixture);
      const [price, validUntil] = await (oracle as any).tokenPriceData();
      console.log(`Oracle price: ${formatUnits6(price)} A7A5 per USDT`);
      console.log(`Oracle validUntil: ${new Date(Number(validUntil) * 1000).toISOString()}`);
      expect(price).to.be.greaterThan(0n);
      const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
      expect(validUntil).to.be.greaterThan(now);
      expect(await (oracle as any).tokenPrice()).to.equal(price);
    });

    it('reverts the convenience price once the Chainlink answer is stale', async function () {
      const {oracle} = await loadFixture(deployPaymasterStackFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      await expect((oracle as any).tokenPrice()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__StalePrice');
    });
  });

  describe('Access control', function () {
    it('allows withdrawal by the owner', async function () {
      const {paymaster, deployer, ownerAddr, entryPoint, paymasterAddr} = await loadFixture(deployPaymasterStackFixture);

      const WITHDRAW_AMOUNT = ethers.parseEther('1');
      const recipientEthBefore = await ethers.provider.getBalance(ownerAddr);
      const pmDepositBefore = await (entryPoint as any).balanceOf(paymasterAddr);

      await (await (paymaster as any).connect(deployer).withdraw(ownerAddr, WITHDRAW_AMOUNT)).wait();

      const recipientEthAfter = await ethers.provider.getBalance(ownerAddr);
      const pmDepositAfter = await (entryPoint as any).balanceOf(paymasterAddr);

      expect(recipientEthAfter - recipientEthBefore).to.equal(WITHDRAW_AMOUNT);
      expect(pmDepositBefore - pmDepositAfter).to.equal(WITHDRAW_AMOUNT);
    });

    it('only the owner can withdraw the EntryPoint deposit', async function () {
      const {paymaster, owner, deployerAddr} = await loadFixture(deployPaymasterStackFixture);
      await expect((paymaster as any).connect(owner).withdraw(deployerAddr, 1n)).to.be.revertedWithCustomError(
        paymaster,
        'OwnableUnauthorizedAccount',
      );
    });

    it('only the owner can pause', async function () {
      const {paymaster, owner} = await loadFixture(deployPaymasterStackFixture);
      await expect((paymaster as any).connect(owner).pause()).to.be.revertedWithCustomError(paymaster, 'OwnableUnauthorizedAccount');
    });
  });

  describe('End-to-end: gas paid in A7A5', function () {
    it('executes a swap with the account spending zero ETH; paymaster reimbursed in A7A5', async function () {
      const f = await loadFixture(deployPaymasterStackFixture);

      const accUsdtBefore: bigint = await usdt(ethers.provider).balanceOf(f.accountAddr);
      const accA7A5Before: bigint = await a7a5(ethers.provider).balanceOf(f.accountAddr);
      const accEthBefore: bigint = await ethers.provider.getBalance(f.accountAddr);
      const pmA7A5Before: bigint = await a7a5(ethers.provider).balanceOf(f.paymasterAddr);
      const pmDepositBefore: bigint = await (f.entryPoint as any).balanceOf(f.paymasterAddr);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildSwapCallData(f.paraSwapAddr),
        paymaster: f.paymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.emit(f.paymaster, 'UserOperationSponsored');

      const accUsdtAfter: bigint = await usdt(ethers.provider).balanceOf(f.accountAddr);
      const accA7A5After: bigint = await a7a5(ethers.provider).balanceOf(f.accountAddr);
      const accEthAfter: bigint = await ethers.provider.getBalance(f.accountAddr);
      const pmA7A5After: bigint = await a7a5(ethers.provider).balanceOf(f.paymasterAddr);
      const pmDepositAfter: bigint = await (f.entryPoint as any).balanceOf(f.paymasterAddr);

      const gasInA7A5 = pmA7A5After - pmA7A5Before;
      const gasInEth = pmDepositBefore - pmDepositAfter;

      console.log('  ── Before ────────────────────────────────────────────');
      console.log(`  Account  USDT:      ${formatUnits6(accUsdtBefore)}`);
      console.log(`  Account  A7A5:      ${formatUnits6(accA7A5Before)}`);
      console.log(`  Account  ETH:       ${ethers.formatEther(accEthBefore)} ETH`);
      console.log(`  Paymaster A7A5:     ${formatUnits6(pmA7A5Before)}`);
      console.log(`  Paymaster deposit:  ${ethers.formatEther(pmDepositBefore)} ETH`);
      console.log('  ── After ─────────────────────────────────────────────');
      console.log(`  Account  USDT:      ${formatUnits6(accUsdtAfter)}`);
      console.log(`  Account  A7A5:      ${formatUnits6(accA7A5After)}`);
      console.log(`  Account  ETH:       ${ethers.formatEther(accEthAfter)} ETH`);
      console.log(`  Paymaster A7A5:     ${formatUnits6(pmA7A5After)}`);
      console.log(`  Paymaster deposit:  ${ethers.formatEther(pmDepositAfter)} ETH`);
      console.log('  ── Deltas ────────────────────────────────────────────');
      console.log(`  USDT received:       +${formatUnits6(accUsdtAfter - accUsdtBefore)}`);
      console.log(`  A7A5 lost:           -${formatUnits6(accA7A5Before - accA7A5After)}  (swap=${formatUnits6(A7A5_SWAP_IN)} + gas=${formatUnits6(gasInA7A5)})`);
      console.log(`  Paymaster A7A5 gain: +${formatUnits6(gasInA7A5)}`);
      console.log(`  Paymaster ETH spent: -${ethers.formatEther(gasInEth)} ETH`);

      // Swap happened: account received USDT.
      expect(accUsdtAfter - accUsdtBefore).to.be.greaterThan(0n);
      // Account never touched ETH.
      expect(accEthAfter).to.equal(accEthBefore);
      // Account paid A7A5 for both the swap input and the gas (more than just the swap).
      expect(accA7A5Before - accA7A5After).to.be.greaterThan(A7A5_SWAP_IN);
      // Paymaster was reimbursed in A7A5 and spent ETH deposit on gas.
      expect(pmA7A5After - pmA7A5Before).to.be.greaterThan(0n);
      expect(pmDepositBefore - pmDepositAfter).to.be.greaterThan(0n);
      // Cross-math: every A7A5 wei that left the account = swap input + gas the paymaster kept.
      expect(accA7A5Before - accA7A5After).to.equal(A7A5_SWAP_IN + gasInA7A5);
    });
  });

  describe('Fee-on-transfer (A7A5 fee enabled)', function () {
    it('gross-up keeps the paymaster whole when A7A5 charges a 1% transfer fee', async function () {
      const f = await loadFixture(deployPaymasterStackFixture);

      // Enable a 1% A7A5 transfer fee by locating and writing its basisPointsRate slot.
      const bpsSlot = await findBpsSlot();
      const token = a7a5(ethers.provider);
      const precision: bigint = await token.FEE_PRECISION();
      await networkHelpers.setStorageAt(ADDRESSES.A7A5, bpsSlot, precision / 100n);
      expect(await token.basisPointsRate()).to.equal(precision / 100n);

      const pmA7A5Before: bigint = await token.balanceOf(f.paymasterAddr);
      const pmDepositBefore: bigint = await (f.entryPoint as any).balanceOf(f.paymasterAddr);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildSwapCallData(f.paraSwapAddr),
        paymaster: f.paymasterAddr,
      });
      await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

      const pmA7A5After: bigint = await token.balanceOf(f.paymasterAddr);
      const pmDepositAfter: bigint = await (f.entryPoint as any).balanceOf(f.paymasterAddr);
      const gasInEth: bigint = pmDepositBefore - pmDepositAfter;

      // Despite the FOT skim on the prefund pull, the paymaster nets a positive A7A5 reimbursement
      // for the gas it fronted (gross-up worked; it is not left short).
      expect(gasInEth).to.be.greaterThan(0n);
      expect(pmA7A5After - pmA7A5Before).to.be.greaterThan(0n);
    });
  });

  describe('Rejections', function () {
    it('rejects the op when the account has not approved the paymaster for A7A5', async function () {
      const f = await loadFixture(deployPaymasterStackFixture);

      // Fresh account that approves ParaSwap but NOT the paymaster.
      const account = await ethers.deployContract('SimpleA7A5Account', [ADDRESSES.ENTRYPOINT_V08, f.ownerAddr]);
      await account.waitForDeployment();
      const accountAddr = await account.getAddress();
      await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, accountAddr, A7A5_GAS_FUNDING);
      await approveFromAccount(account, f.owner, ADDRESSES.A7A5, f.paraSwapAddr);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: accountAddr,
        callData: buildSwapCallData(f.paraSwapAddr),
        paymaster: f.paymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });

    it('rejects the op when the price is stale', async function () {
      const f = await loadFixture(deployPaymasterStackFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildSwapCallData(f.paraSwapAddr),
        paymaster: f.paymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });

    it('rejects the op when the paymaster is paused', async function () {
      const f = await loadFixture(deployPaymasterStackFixture);
      await (await (f.paymaster as any).connect(f.deployer).pause()).wait();

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildSwapCallData(f.paraSwapAddr),
        paymaster: f.paymasterAddr,
      });
      await expect((f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr)).to.revert(ethers);
    });
  });
});

// ── Non-fork unit tests (run without MAINNET_FORK) ───────────────────────────

describe('A7A5Paymaster (unit, no fork)', function () {
  this.timeout(60_000);

  async function deployPaymasterUnit() {
    const [deployer] = await ethers.getSigners();

    // Minimal mocks — just need valid non-zero addresses.
    const a7a5Token = await ethers.deployContract('MockToken', [6]);
    await a7a5Token.waitForDeployment();

    const mockA7A5Token = await ethers.deployContract('MockToken', [6]);
    await mockA7A5Token.waitForDeployment();

    const wa7a5 = await ethers.deployContract('MockWA7A5', [await mockA7A5Token.getAddress(), BigInt(10 ** 6), 6]);
    await wa7a5.waitForDeployment();

    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    const feed = await ethers.deployContract('MockChainlinkFeed', [400_000_000_000_000n, now, 18]);
    await feed.waitForDeployment();
    const feedAddr = await feed.getAddress();

    const mockEP = await ethers.deployContract('MockEntryPoint');
    await mockEP.waitForDeployment();

    const oracle = await ethers.deployContract('A7A5NativeOracle', [
      feedAddr,
      feedAddr,
      await wa7a5.getAddress(),
      5 * 60, // MIN_MAX_STALENESS
      await deployer.getAddress(),
    ]);
    await oracle.waitForDeployment();

    const paymaster = await ethers.deployContract('A7A5Paymaster', [
      await mockEP.getAddress(),
      await a7a5Token.getAddress(),
      await oracle.getAddress(),
      await deployer.getAddress(),
    ]);
    await paymaster.waitForDeployment();

    return {deployer, a7a5Token, oracle, paymaster};
  }

  // Line 66: constructor reverts when any address is zero
  it('constructor reverts when entryPoint is the zero address', async function () {
    const [deployer] = await ethers.getSigners();
    const t = await ethers.deployContract('MockToken', [6]);
    await t.waitForDeployment();
    const oracle = await ethers.deployContract('MockToken', [6]); // placeholder
    await oracle.waitForDeployment();
    const ZERO = '0x0000000000000000000000000000000000000000';
    await expect(
      ethers.deployContract('A7A5Paymaster', [ZERO, await t.getAddress(), await oracle.getAddress(), await deployer.getAddress()]),
    ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('A7A5Paymaster')).interface} as any, 'A7A5Paymaster__ZeroAddress');
  });

  it('constructor reverts when a7a5 is the zero address', async function () {
    const [deployer] = await ethers.getSigners();
    const ep = await ethers.deployContract('MockEntryPoint');
    await ep.waitForDeployment();
    const oracle = await ethers.deployContract('MockToken', [6]);
    await oracle.waitForDeployment();
    const ZERO = '0x0000000000000000000000000000000000000000';
    await expect(
      ethers.deployContract('A7A5Paymaster', [await ep.getAddress(), ZERO, await oracle.getAddress(), await deployer.getAddress()]),
    ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('A7A5Paymaster')).interface} as any, 'A7A5Paymaster__ZeroAddress');
  });

  // Lines 77-79: setOracle updates oracle and emits OracleUpdated
  it('setOracle updates the oracle address and emits OracleUpdated', async function () {
    const {deployer, oracle, paymaster} = await deployPaymasterUnit();

    // Deploy a second oracle as the replacement.
    const wa7a5 = await ethers.deployContract('MockWA7A5', [await (await ethers.deployContract('MockToken', [6])).getAddress(), BigInt(10 ** 6), 6]);
    await wa7a5.waitForDeployment();
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    const feed = await ethers.deployContract('MockChainlinkFeed', [400_000_000_000_000n, now, 18]);
    await feed.waitForDeployment();
    const newOracle = await ethers.deployContract('A7A5NativeOracle', [
      await feed.getAddress(),
      await feed.getAddress(),
      await wa7a5.getAddress(),
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
    const {deployer, paymaster} = await deployPaymasterUnit();
    const ZERO = '0x0000000000000000000000000000000000000000';
    await expect((paymaster as any).connect(deployer).setOracle(ZERO)).to.be.revertedWithCustomError(paymaster, 'A7A5Paymaster__ZeroAddress');
  });

  // Line 89: unpause re-enables the paymaster
  it('unpause restores the unpaused state after pause', async function () {
    const {deployer, paymaster} = await deployPaymasterUnit();

    expect(await (paymaster as any).paused()).to.equal(false);
    await (await (paymaster as any).connect(deployer).pause()).wait();
    expect(await (paymaster as any).paused()).to.equal(true);
    await (await (paymaster as any).connect(deployer).unpause()).wait();
    expect(await (paymaster as any).paused()).to.equal(false);
  });
});

// ── FOT slot discovery (mirrors test/ParaSwap/fixtures.ts) ──────────────────────

async function findBpsSlot(): Promise<number> {
  const token = a7a5(ethers.provider);
  const PROBE = 42n;
  for (let slot = 0; slot < 30; slot++) {
    const snap = await networkHelpers.takeSnapshot();
    await networkHelpers.setStorageAt(ADDRESSES.A7A5, slot, PROBE);
    const val: bigint = await token.basisPointsRate();
    await snap.restore();
    if (val === PROBE) return slot;
  }
  throw new Error('basisPointsRate slot not found in slots 0–29');
}
