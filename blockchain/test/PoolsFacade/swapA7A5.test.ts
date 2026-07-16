import {A7A5_IN, conn, ethers, FAR_DEADLINE, loadFixture, networkHelpers, PAST_DEADLINE, SIDE, USDT_IN} from './consts.js';
import {gasUsedEthStr, revertMsg, tokens, zeroV2Reserves} from './helpers.js';
import {buyFixture, deployFacadeFixture, fotFixture, sellFixture} from './fixtures.js';
import {expect} from 'chai';
import {ADDRESSES} from '../../common/addresses.js';
import {abs, formatUnits6, forkReady, fundFromWhale, A7A5_MAX_ROUNDING_ERROR} from '../helpers.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.js';
import type {HardhatEthersSigner} from '@nomicfoundation/hardhat-ethers/types';
import type {IA7A5} from '../../types/ethers-contracts/index.js';

// ── swapA7A5 ────────────────────────────────────────────────────────────
describe('swapA7A5', function () {
  if (!forkReady(ADDRESSES.A7A5, ADDRESSES.WA7A5)) {
    it.skip('requires MAINNET_FORK=1 and real A7A5/WA7A5 addresses', () => {});
    return;
  }

  let facade: PoolsFacade;
  let facadeAddr: string;
  let trader: HardhatEthersSigner;
  let traderAddr: string;

  let usdt: IA7A5;
  let a7a5: IA7A5;

  let bps: bigint;
  let precision: bigint;

  let usdtBefore: bigint;
  let a7a5Before: bigint;

  describe('BUY', function () {
    const side = SIDE.BUY;

    before(() => console.log('\n  ── BUY ─────────────────────────────────────────────'));

    beforeEach(async function () {
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      ({usdt, a7a5} = tokens());
      usdtBefore = await usdt.balanceOf(traderAddr);
      a7a5Before = await a7a5.balanceOf(traderAddr);

      bps = await a7a5.basisPointsRate();
      precision = await a7a5.FEE_PRECISION();
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
    });

    it('emits A7A5Swapped with DIRECT strategy', async () => {
      await expect(facade.connect(trader).swapA7A5(USDT_IN, side, 0n, FAR_DEADLINE))
        .to.emit(facade, 'A7A5Swapped')
        .withArgs(traderAddr, traderAddr, side, 0, USDT_IN, (value: bigint) => value > 0n);
    });

    it('trader receives A7A5 and spends exactly USDT_IN', async () => {
      console.log('\n  ── swapA7A5 BUY — basic ────────────────────────────');

      const expectedA7A5: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, side);

      const receipt = await (await facade.connect(trader).swapA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();

      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      const a7a5After: bigint = await a7a5.balanceOf(traderAddr);
      const a7a5Gained: bigint = a7a5After - a7a5Before;

      console.log(`        amountIn      ${formatUnits6(USDT_IN)} USDT`);
      console.log(`        a7a5Gained    ${formatUnits6(a7a5Gained)} A7A5  (balance-delta)`);
      console.log(`        a7a5Expected    ${formatUnits6(expectedA7A5)} A7A5  (balance-delta)`);
      console.log(`        USDT spent    ${formatUnits6(usdtSpent)} USDT`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained).to.be.closeTo(expectedA7A5, A7A5_MAX_ROUNDING_ERROR, 'A7A5 amount must be within 1 wei of quote');
      expect(usdtSpent, 'trader must spend exactly USDT_IN').to.equal(USDT_IN);

      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await a7a5.balanceOf(facadeAddr), 'facade must hold no A7A5').to.equal(0n);
    });

    it('actual A7A5 received equals FOT-inclusive quote (within 1 wei)', async () => {
      console.log('\n  ── swapA7A5 BUY — received equals FOT-inclusive quote ─');

      const a7a5Expected: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, side);
      expect(a7a5Expected).to.be.greaterThan(0n);

      const receipt = await (await facade.connect(trader).swapA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const a7a5Gained: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      const usdtSpent: bigint = usdtBefore - (await usdt.balanceOf(traderAddr));
      expect(usdtSpent).to.equal(USDT_IN); // spent exactly USDT_IN

      console.log(`        a7a5Expected  ${formatUnits6(a7a5Expected)} A7A5  (FOT-inclusive quote)`);
      console.log(`        a7a5Gained    ${formatUnits6(a7a5Gained)} A7A5  (balance-delta)`);
      console.log(`        usdtSpent     ${formatUnits6(usdtSpent)} USDT  (balance-delta)`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained).to.be.closeTo(a7a5Expected, A7A5_MAX_ROUNDING_ERROR, 'a7a5Gained must match FOT-inclusive quote within 1 wei');
    });

    it('actual A7A5 received equals FOT-inclusive quote within rounding', async () => {
      console.log('\n  ── swapA7A5 BUY — output == FOT-inclusive quote ─────');
      const a7a5Expected: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, side);
      const receipt = await (await facade.connect(trader).swapA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();

      const a7a5Gained: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      expect(usdtSpent).to.equal(USDT_IN);

      console.log(`        a7a5Expected   ${formatUnits6(a7a5Expected)} A7A5  (FOT-inclusive)`);
      console.log(`        a7a5Gained ${formatUnits6(a7a5Gained)} A7A5  (balance-delta)`);
      console.log(`        usdtSpent     ${formatUnits6(usdtSpent)} USDT  (balance-delta)`);
      console.log(`        gas used   ${gasUsedEthStr(receipt)} ETH`);

      const absDiff = abs(a7a5Gained, a7a5Expected);
      expect(absDiff, 'a7a5Gained must match FOT-inclusive quote within 5 units').to.be.lessThanOrEqual(5n);
    });

    it('swapA7A5 BUY: per-unit A7A5 output decreases as USDT input grows (AMM price impact)', async () => {
      console.log('\n  ── swapA7A5 BUY — price impact ─────────────────────');
      const LARGE_USDT = 10_000_000_000n;

      const snapSmall = await networkHelpers.takeSnapshot();
      await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, traderAddr, USDT_IN);
      await (usdt.connect(trader) as any).approve(facadeAddr, 0n);
      await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
      const a7a5BeforeSmall: bigint = await a7a5.balanceOf(traderAddr);
      const rcptSmall = await (await facade.connect(trader).swapA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const gainedSmall: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5BeforeSmall;
      await snapSmall.restore();

      const snapLarge = await networkHelpers.takeSnapshot();
      await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, traderAddr, LARGE_USDT);
      await (usdt.connect(trader) as any).approve(facadeAddr, 0n);
      await (usdt.connect(trader) as any).approve(facadeAddr, LARGE_USDT);
      const a7a5BeforeLarge: bigint = await a7a5.balanceOf(traderAddr);
      const rcptLarge = await (await facade.connect(trader).swapA7A5(LARGE_USDT, side, 0n, FAR_DEADLINE)).wait();
      const gainedLarge: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5BeforeLarge;
      await snapLarge.restore();

      const perUnitSmall = gainedSmall * LARGE_USDT;
      const perUnitLarge = gainedLarge * USDT_IN;
      const impact = (Number(perUnitSmall - perUnitLarge) / Number(perUnitSmall)) * 100;

      console.log(`        small (${formatUnits6(USDT_IN)} USDT)   gained ${formatUnits6(gainedSmall)} A7A5  gas ${gasUsedEthStr(rcptSmall)} ETH`);
      console.log(`        large (${formatUnits6(LARGE_USDT)} USDT)  gained ${formatUnits6(gainedLarge)} A7A5  gas ${gasUsedEthStr(rcptLarge)} ETH`);
      console.log(`        price impact  ${impact.toFixed(4)} %`);
      expect(perUnitSmall, 'per-unit output must fall with larger input (AMM price impact)').to.be.greaterThan(perUnitLarge);
    });

    it("swapA7A5 BUY: reverts 'insufficient output' when amountOutMin exceeds actual output", async () => {
      console.log('\n  ── swapA7A5 BUY — amountOutMin too high ────────────');
      const msg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, side, ethers.MaxUint256, FAR_DEADLINE));
      console.log(`        revert msg: ${msg.slice(0, 80)}`);
      expect(msg, "must revert with 'InsufficientOutput'").to.contain('InsufficientOutput');
    });

    it('swapA7A5 BUY: succeeds when amountOutMin is ≤ actual output', async () => {
      console.log('\n  ── swapA7A5 BUY — sane amountOutMin ────────────────');
      const quoteOut: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, side);
      const saneMin: bigint = (quoteOut * 90n) / 100n;
      const a7a5Before: bigint = await a7a5.balanceOf(traderAddr);
      const receipt = await (await facade.connect(trader).swapA7A5(USDT_IN, side, saneMin, FAR_DEADLINE)).wait();
      const a7a5Gained: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      console.log(`        quoteOut   ${formatUnits6(quoteOut)} A7A5  (FOT-inclusive)`);
      console.log(`        saneMin    ${formatUnits6(saneMin)} A7A5`);
      console.log(`        a7a5Gained ${formatUnits6(a7a5Gained)} A7A5`);
      console.log(`        gas used   ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained, 'trader must receive A7A5').to.be.greaterThan(0n);
      expect(a7a5Gained, 'gained must be ≥ saneMin').to.be.greaterThanOrEqual(saneMin);
    });
  });

  describe('SELL', function () {
    const side = SIDE.SELL;

    let usdtBefore: bigint;
    let a7a5Before: bigint;

    before(() => console.log('\n  ── SELL ────────────────────────────────────────────'));

    beforeEach(async function () {
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(sellFixture));
      ({usdt, a7a5} = tokens());

      usdtBefore = await usdt.balanceOf(traderAddr);
      a7a5Before = await a7a5.balanceOf(traderAddr);

      bps = await a7a5.basisPointsRate();
      precision = await a7a5.FEE_PRECISION();
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
    });

    it('trader receives USDT and spends A7A5_IN (±FOT rounding)', async () => {
      console.log('\n  ── swapA7A5 SELL — basic ───────────────────────────');

      const usdtExpected = await facade.quoteA7A5PerUSDT(A7A5_IN, side);

      const receipt = await (await facade.connect(trader).swapA7A5(A7A5_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtGained: bigint = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const a7a5Spent: bigint = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`        amountIn      ${formatUnits6(A7A5_IN)} A7A5`);
      console.log(`        USDT expected   ${formatUnits6(usdtExpected)} USDT`);
      console.log(`        USDT gained   ${formatUnits6(usdtGained)} USDT  (balance-delta)`);
      console.log(`        A7A5 spent    ${formatUnits6(a7a5Spent)} A7A5`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'trader must receive USDT').to.be.equal(usdtExpected);
      expect(a7a5Spent, 'trader A7A5 decrease must be ≤ amountIn').to.be.lessThanOrEqual(A7A5_IN);

      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await a7a5.balanceOf(facadeAddr), 'facade must hold no A7A5').to.equal(0n);
    });

    it('USDT received equals quoteA7A5PerUSDT(A7A5_IN, SELL) (FOT handled internally)', async () => {
      console.log('\n  ── swapA7A5 SELL — output == quote(A7A5_IN) ────────');

      const measuredEffectiveIn: bigint = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const usdtExpected: bigint = await facade.quoteA7A5PerUSDT(A7A5_IN, side);

      const receipt = await (await facade.connect(trader).swapA7A5(A7A5_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtGained: bigint = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const a7a5Spent: bigint = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`        grossIn           ${formatUnits6(A7A5_IN)} A7A5`);
      console.log(`        effectiveIn  ${formatUnits6(measuredEffectiveIn)} A7A5  (FOT-adjusted)`);
      console.log(`        quoteAtMeasured   ${formatUnits6(usdtExpected)} USDT  (FOT handled internally)`);
      console.log(`        USDT gained       ${formatUnits6(usdtGained)} USDT  (balance-delta)`);
      console.log(`        gas used          ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'USDT received must equal quoteA7A5PerUSDT(A7A5_IN, SELL)').to.equal(usdtExpected);

      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN);
      expect(a7a5Spent).to.be.closeTo(measuredEffectiveIn, A7A5_MAX_ROUNDING_ERROR, 'a7a5Spent must match measuredEffectiveIn within 1 wei');
    });
  });

  // ── swapA7A5 — non-zero A7A5 FOT ───────────────────────────────────────
  // basisPointsRate is 0 on mainnet; each test here loads fotFixture which
  // overrides it to 1% so FOT-sensitive math is exercised with a real gap.
  describe('non-zero A7A5 FOT', function () {
    let snap: any;

    before(() => console.log('\n  ── non-zero A7A5 FOT ───────────────────────────────'));

    this.beforeEach(async function () {
      await networkHelpers.clearSnapshots();
      snap = await networkHelpers.takeSnapshot();

      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(fotFixture));
      ({usdt, a7a5} = tokens());
      usdtBefore = await usdt.balanceOf(traderAddr);
      a7a5Before = await a7a5.balanceOf(traderAddr);

      bps = await a7a5.basisPointsRate();
      precision = await a7a5.FEE_PRECISION();
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
    });
    this.afterEach(async function () {
      await snap.restore();
    });
    it('getA7A5EffectiveOutput: deducts non-zero transfer tax correctly', async () => {
      console.log('\n  ── FOT getA7A5EffectiveOutput ─────────────────────────');
      expect(bps, 'bps must be non-zero in this group').to.be.greaterThan(0n);

      const effectiveOut: bigint = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const expected: bigint = (A7A5_IN * (precision - bps)) / precision;

      console.log(`        bps           ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
      console.log(`        grossIn       ${formatUnits6(A7A5_IN)} A7A5`);
      console.log(`        effectiveOut  ${formatUnits6(effectiveOut)} A7A5`);
      console.log(`        fee deducted  ${formatUnits6(A7A5_IN - effectiveOut)} A7A5`);

      expect(effectiveOut, 'effectiveOut must be strictly less than grossIn').to.be.lessThan(A7A5_IN);
      expect(effectiveOut, 'effectiveOut must match manual calc').to.equal(expected);
    });

    it('BUY: actual A7A5 received equals FOT-inclusive quote with real non-zero fee', async () => {
      console.log('\n  ── FOT BUY output == FOT-inclusive quote ──────────────');
      expect(bps, 'bps must be non-zero in this group').to.be.greaterThan(0n);

      await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, traderAddr, USDT_IN);
      await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);

      const a7a5Expected: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, SIDE.BUY);
      const a7a5Before: bigint = await a7a5.balanceOf(traderAddr);
      const receipt = await (await facade.connect(trader).swapA7A5(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE)).wait();
      const a7a5Gained: bigint = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      console.log(`        bps        ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
      console.log(`        a7a5Expected   ${formatUnits6(a7a5Expected)} A7A5  (FOT-inclusive)`);
      console.log(`        a7a5Gained ${formatUnits6(a7a5Gained)} A7A5  (balance-delta)`);
      console.log(`        gas used   ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained).to.be.closeTo(a7a5Expected, A7A5_MAX_ROUNDING_ERROR, 'a7a5Gained must match FOT-inclusive quote within 1 wei');
    });

    it('swapA7A5 SELL: USDT received equals quoteA7A5PerUSDT(A7A5_IN, SELL) with real non-zero fee', async () => {
      console.log('\n  ── FOT SELL output == quote(A7A5_IN) ──────────────────');
      expect(bps, 'bps must be non-zero in this group').to.be.greaterThan(0n);

      await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, traderAddr, A7A5_IN * 2n);
      await (a7a5.connect(trader) as any).approve(facadeAddr, A7A5_IN);

      const a7a5CameToPool: bigint = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const usdtExpected: bigint = await facade.quoteA7A5PerUSDT(A7A5_IN, SIDE.SELL);
      const usdtBefore: bigint = await usdt.balanceOf(traderAddr);
      const receipt = await (await facade.connect(trader).swapA7A5(A7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE)).wait();
      const usdtGained: bigint = (await usdt.balanceOf(traderAddr)) - usdtBefore;

      console.log(`        bps                ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
      console.log(`        grossIn            ${formatUnits6(A7A5_IN)} A7A5`);
      console.log(`        a7a5CameToPool  ${formatUnits6(a7a5CameToPool)} A7A5  (FOT-adjusted, for reference)`);
      console.log(`        USDT Expected    ${formatUnits6(usdtExpected)} USDT  (FOT handled internally)`);
      console.log(`        USDT gained        ${formatUnits6(usdtGained)} USDT  (balance-delta)`);
      console.log(`        gas used           ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'USDT received must equal quoteA7A5PerUSDT(A7A5_IN, SELL)').to.equal(usdtExpected);
      expect(a7a5CameToPool, 'measuredEffective must be < grossIn with non-zero FOT').to.be.lessThan(A7A5_IN);
    });
  });

  // ── custom recipient ────────────────────────────────────────────────────
  describe('custom recipient', function () {
    let recipient: HardhatEthersSigner;
    let recipientAddr: string;

    before(() => console.log('\n  ── custom recipient ────────────────────────────────'));

    it('BUY: recipient receives quoted A7A5, caller balance unchanged', async () => {
      console.log('\n  ── swapA7A5 BUY — custom recipient ─────────────────');
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      ({usdt, a7a5} = tokens());
      [, , recipient] = await ethers.getSigners();
      recipientAddr = await recipient.getAddress();

      const quoted = await facade.quoteA7A5PerUSDT(USDT_IN, SIDE.BUY);
      const callerA7A5Before = await a7a5.balanceOf(traderAddr);

      await facade.connect(trader)['swapA7A5(uint256,uint8,uint256,uint256,address)'](
        USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE, recipientAddr
      );

      const recipientGained = await a7a5.balanceOf(recipientAddr);
      console.log(`        quoted           ${formatUnits6(quoted)} A7A5`);
      console.log(`        recipient gained ${formatUnits6(recipientGained)} A7A5`);

      expect(recipientGained).to.be.closeTo(quoted, A7A5_MAX_ROUNDING_ERROR, 'recipient must receive quoted A7A5');
      expect(await a7a5.balanceOf(traderAddr)).to.equal(callerA7A5Before, 'caller A7A5 balance must be unchanged');
      expect(await a7a5.balanceOf(facadeAddr)).to.equal(0n, 'facade must hold no A7A5');
    });

    it('SELL: recipient receives quoted USDT, caller balance unchanged', async () => {
      console.log('\n  ── swapA7A5 SELL — custom recipient ────────────────');
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(sellFixture));
      ({usdt, a7a5} = tokens());
      [, , recipient] = await ethers.getSigners();
      recipientAddr = await recipient.getAddress();

      const quoted = await facade.quoteA7A5PerUSDT(A7A5_IN, SIDE.SELL);
      const callerUsdtBefore = await usdt.balanceOf(traderAddr);

      await facade.connect(trader)['swapA7A5(uint256,uint8,uint256,uint256,address)'](
        A7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE, recipientAddr
      );

      const recipientUsdt = await usdt.balanceOf(recipientAddr);
      console.log(`        quoted           ${formatUnits6(quoted)} USDT`);
      console.log(`        recipient gained ${formatUnits6(recipientUsdt)} USDT`);

      expect(recipientUsdt).to.equal(quoted, 'recipient must receive quoted USDT');
      expect(await usdt.balanceOf(traderAddr)).to.equal(callerUsdtBefore, 'caller USDT balance must be unchanged');
      expect(await usdt.balanceOf(facadeAddr)).to.equal(0n, 'facade must hold no USDT');
    });
  });

  describe('REVERTS', async function () {
    before(() => console.log('\n  ── REVERTS ─────────────────────────────────────────'));
    it("swapA7A5: reverts 'insufficient allowance' when caller has no token approval", async () => {
      console.log('\n  ── swapA7A5 — no approval ──────────────────────────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const buyMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
      const sellMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(A7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE));
      console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
      console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
      expect(buyMsg).to.contain('InsufficientAllowance');
      expect(sellMsg).to.contain('InsufficientAllowance');
    });

    it("swapA7A5: reverts 'empty reserves' when V2 pair reserves are zeroed via storage", async () => {
      console.log('\n  ── swapA7A5 — empty reserves ───────────────────────');
      const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
      const {usdt} = tokens();
      const snap = await zeroV2Reserves(ADDRESSES.V2_PAIR_USDT_A7A5);
      await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, traderAddr, USDT_IN * 2n);
      await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
      const msg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
      console.log(`        revert msg: ${msg}`);
      expect(msg, "must revert with 'EmptyReserves'").to.contain('EmptyReserves');
      await snap.restore();
    });

    it("swapA7A5: reverts 'zero amountIn' when called with amountIn == 0", async () => {
      console.log('\n  ── swapA7A5 — zero amountIn ────────────────────────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const buyMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(0n, SIDE.BUY, 0n, FAR_DEADLINE));
      const sellMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(0n, SIDE.SELL, 0n, FAR_DEADLINE));
      console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
      console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
      expect(buyMsg).to.contain('ZeroAmountIn');
      expect(sellMsg).to.contain('ZeroAmountIn');
    });

    it("swapA7A5: reverts 'expired' when deadline is in the past", async () => {
      console.log('\n  ── swapA7A5 — expired deadline ─────────────────────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const buyMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, PAST_DEADLINE));
      const sellMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(A7A5_IN, SIDE.SELL, 0n, PAST_DEADLINE));
      console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
      console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
      expect(buyMsg).to.contain('Expired');
      expect(sellMsg).to.contain('Expired');
    });
  });
});
