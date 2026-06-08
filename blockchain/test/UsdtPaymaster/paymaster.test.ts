import {expect} from 'chai';

import {ADDRESSES} from '../../common/addresses.js';
import {buildSignedUserOp} from '../../common/erc4337.js';
import {fundFromWhale, forkReady} from '../helpers.js';
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
      expect(price).to.be.greaterThan(0n);
      const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
      expect(validUntil).to.be.greaterThan(now);
    });
  });

  describe('End-to-end: gas paid in USDT', function () {
    it('executes USDT → A7A5 swap with zero ETH spent by account', async function () {
      const f = await loadFixture(deployUsdtPaymasterStack);

      const accA7A5Before = await IA7A5__factory.connect(ADDRESSES.A7A5, ethers.provider).balanceOf(f.accountAddr);
      const accUsdtBefore = await usdt(ethers.provider).balanceOf(f.accountAddr);
      const accEthBefore = await ethers.provider.getBalance(f.accountAddr);
      const pmUsdtBefore = await usdt(ethers.provider).balanceOf(f.usdtPaymasterAddr);

      const op = await buildSignedUserOp(ethers as any, f.entryPoint as any, f.owner as any, {
        sender: f.accountAddr,
        callData: buildUsdtSwapCallData(f.paraSwapAddr),
        paymaster: f.usdtPaymasterAddr,
      });
      await (f.entryPoint as any).connect(f.bundler).handleOps([op], f.deployerAddr);

      expect(await IA7A5__factory.connect(ADDRESSES.A7A5, ethers.provider).balanceOf(f.accountAddr)).to.be.greaterThan(
        accA7A5Before,
      );
      expect(await usdt(ethers.provider).balanceOf(f.accountAddr)).to.be.lessThan(accUsdtBefore);
      expect(await ethers.provider.getBalance(f.accountAddr)).to.equal(accEthBefore);
      expect(await usdt(ethers.provider).balanceOf(f.usdtPaymasterAddr)).to.be.greaterThan(pmUsdtBefore);
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
  });
});

describe('UsdtPaymaster (unit, no fork)', function () {
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
});
