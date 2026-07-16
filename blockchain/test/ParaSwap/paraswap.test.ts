import {expect} from 'chai';
import {
  ethers,
  loadFixture,
  FAR_DEADLINE,
  PAST_DEADLINE,
  USDT_IN,
  A7A5_IN,
  USDC_IN,
  WETH_IN,
  NO_FEE,
  V3_FEE_USDC,
  V3_FEE_WA7A5,
  V3_FEE_WETH,
} from './consts.js';
import {deployParaSwapFixture, fundedFixture, fotFixture} from './fixtures.js';
import {ADDRESSES} from '../../common/addresses.js';
import type {ParaSwap} from '../../types/ethers-contracts/ParaSwap.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.sol/PoolsFacade.js';
import type {HardhatEthersSigner} from '@nomicfoundation/hardhat-ethers/types';
import {tokens, gasReport, fetchEthPrice} from './helpers.js';
import type {IA7A5} from '../../types/ethers-contracts/interfaces/IA7A5.sol/IA7A5.js';
import type {IWA7A5} from '../../types/ethers-contracts/ParaSwap.sol/IWA7A5.js';
import {abs, formatUnits6, formatUnits18, forkReady, checkRoundingError, A7A5_MAX_ROUNDING_ERROR} from '../helpers.js';

// ── Global ETH/USD price for gas display ─────────────────────────────────────

let ethUsd = 3000; // fallback; overwritten by before()

before(async function () {
  try {
    ethUsd = await fetchEthPrice();
  } catch {
    // fork may not have Chainlink; use fallback
  }
  console.log(`\n  ETH price: $${ethUsd.toFixed(0)}/ETH`);
});

// ── A7A5 SELL (A7A5 → USDT) ──────────────────────────────────────────────────

describe('ParaSwap', function () {
  if (!forkReady(ADDRESSES.A7A5, ADDRESSES.WA7A5)) {
    it.skip('requires MAINNET_FORK=1 and real A7A5/WA7A5 addresses', () => {
      console.log('MAINNET_FORK=1 and real A7A5/WA7A5 addresses');
    });
    return;
  }

  let paraSwap: ParaSwap;
  let paraSwapAddr: string;
  let trader: HardhatEthersSigner;
  let traderAddr: string;

  let usdt: IA7A5;
  let usdc: IA7A5;
  let a7a5: IA7A5;
  let wa7a5: IWA7A5;
  let weth: IWA7A5;

  let usdtBalanceBefore: bigint;
  let usdcBalanceBefore: bigint;
  let a7a5BalanceBefore: bigint;
  let wa7a5BalanceBefore: bigint;
  let wethBalanceBefore: bigint;

  describe('ONE HOP', () => {
    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(fundedFixture));
      ({usdt, a7a5, wa7a5, usdc} = tokens());

      usdtBalanceBefore = await usdt.balanceOf(traderAddr);
      usdcBalanceBefore = await usdc.balanceOf(traderAddr);
      a7a5BalanceBefore = await a7a5.balanceOf(traderAddr);
      wa7a5BalanceBefore = await wa7a5.balanceOf(traderAddr);
    });

    it('A7A5 SELL (A7A5 → USDT)', async function () {
      expect(a7a5BalanceBefore).to.be.closeTo(A7A5_IN, 1n, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, NO_FEE);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, quoted, traderAddr);

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBalanceBefore;
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent    ${formatUnits6(a7a5Spent)}`);
      console.log(`    USDT gained   ${formatUnits6(usdtGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.be.closeTo(quoted, 2n, 'actual should match quote');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });

    // ── A7A5 BUY (USDT → A7A5) ─────────────────────────────────────────────────

    it('A7A5 BUY (USDT → A7A5)', async function () {
      expect(await usdt.balanceOf(traderAddr)).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      await tokens(trader).usdt.approve(paraSwapAddr, USDT_IN);
      expect(await usdt.allowance(traderAddr, paraSwapAddr)).to.equal(USDT_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, NO_FEE);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, (v: bigint) => checkRoundingError(v, quoted), traderAddr);

      const usdtSpent = usdtBalanceBefore - (await usdt.balanceOf(traderAddr));
      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;

      console.log(`    USDT spent    ${formatUnits6(usdtSpent)}`);
      console.log(`    A7A5 gained   ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      // Double FOT (pair→ParaSwap then ParaSwap→user) has ≤1 rounding error per hit.
      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n, 'should receive A7A5');
      expect(usdtSpent).to.equal(USDT_IN, 'should spend exactly USDT_IN');

      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });
    it('wA7A5 SELL (wA7A5 → USDT)', async function () {
      const wa7a5Balance = await wa7a5.balanceOf(traderAddr);
      expect(wa7a5Balance).to.be.gte(0, 'trader must hold wa7a5Balance');
      await tokens(trader).wa7a5.approve(paraSwapAddr, wa7a5Balance);
      expect(await wa7a5.allowance(traderAddr, paraSwapAddr)).to.equal(wa7a5Balance, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, V3_FEE_WA7A5);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, 0n, V3_FEE_WA7A5, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, quoted, traderAddr);

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBalanceBefore;
      const wa7a5Spent = wa7a5BalanceBefore - (await wa7a5.balanceOf(traderAddr));

      console.log(`    wA7A5 spent   ${formatUnits6(wa7a5Spent)}`);
      console.log(`    USDT gained   ${formatUnits6(usdtGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');

      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });

    it('wA7A5 BUY (USDT → wA7A5)', async function () {
      expect(await usdt.balanceOf(traderAddr)).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      await tokens(trader).usdt.approve(paraSwapAddr, USDT_IN);
      expect(await usdt.allowance(traderAddr, paraSwapAddr)).to.equal(USDT_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, V3_FEE_WA7A5);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, 0n, V3_FEE_WA7A5, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.USDT, ADDRESSES.WA7A5, USDC_IN, quoted, traderAddr);

      const usdtSpent = usdtBalanceBefore - (await usdt.balanceOf(traderAddr));
      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5BalanceBefore;

      console.log(`    USDT spent    ${formatUnits6(usdtSpent)}`);
      console.log(`    wA7A5 gained  ${formatUnits6(wa7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(usdtSpent).to.equal(USDT_IN, 'should spend exactly USDT_IN');

      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });

    it('Generic V3 (USDC → USDT)', async function () {
      expect(await usdc.balanceOf(traderAddr)).to.be.gte(USDC_IN, 'trader must hold USDC_IN');
      await tokens(trader).usdc.approve(paraSwapAddr, USDC_IN);
      expect(await usdc.allowance(traderAddr, paraSwapAddr)).to.equal(USDC_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, quoted, traderAddr);

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBalanceBefore;
      const usdcSpent = usdcBalanceBefore - (await usdc.balanceOf(traderAddr));

      console.log(`    USDC spent    ${formatUnits6(usdcSpent)}`);
      console.log(`    USDT gained   ${formatUnits6(usdtGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');

      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });
  });

  describe('TWO-HOP', function () {
    let facade: PoolsFacade;

    before(function () {
      console.log(`\n\n`);
    });

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr, facade} = await loadFixture(fundedFixture));
      ({usdt, a7a5, wa7a5, usdc, weth} = tokens());

      usdtBalanceBefore = await usdt.balanceOf(traderAddr);
      usdcBalanceBefore = await usdc.balanceOf(traderAddr);
      a7a5BalanceBefore = await a7a5.balanceOf(traderAddr);
      wa7a5BalanceBefore = await wa7a5.balanceOf(traderAddr);
      wethBalanceBefore = await weth.balanceOf(traderAddr);
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → USDC)', async function () {
      expect(a7a5BalanceBefore).to.be.closeTo(A7A5_IN, 1n, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, V3_FEE_USDC);

      // Verify two-leg composition: facade A7A5→USDT, then V3 USDT→USDC.
      // ParaSwap applies 1 external FOT hit (trader→ParaSwap); the facade nets
      // out its own internal hops inside getBestQuoteA7A5PerUSDT.
      const effectiveIn = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const [usdtMid] = await facade.getBestQuoteA7A5PerUSDT.staticCall(effectiveIn, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.USDC, usdtMid, V3_FEE_USDC);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, quoted, traderAddr);

      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBalanceBefore;
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent    ${formatUnits6(a7a5Spent)}`);
      console.log(`    USDC gained   ${formatUnits6(usdcGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.be.closeTo(quoted, 2n, 'actual should match quote');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });

    it('A7A5 BUY two-hop (USDC → USDT → A7A5)', async function () {
      expect(usdcBalanceBefore).to.be.gte(USDC_IN, 'trader must hold USDC_IN');
      await tokens(trader).usdc.approve(paraSwapAddr, USDC_IN);
      expect(await usdc.allowance(traderAddr, paraSwapAddr)).to.equal(USDC_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, V3_FEE_USDC);

      // Verify two-leg composition: V3 USDC→USDT, then facade USDT→A7A5.
      // ParaSwap applies 1 external FOT hit (ParaSwap→user); the facade nets
      // out its own internal hops inside getBestQuoteA7A5PerUSDT.
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);
      const [a7a5Raw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);

      const a7a5AfterFot = await facade.getA7A5EffectiveOutput(a7a5Raw);

      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(a7a5AfterFot).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, (v: bigint) => checkRoundingError(v, quoted), traderAddr);

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      const usdcSpent = usdcBalanceBefore - (await usdc.balanceOf(traderAddr));

      console.log(
        `    LEGS: (${formatUnits6(USDC_IN)} USDC) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits6(a7a5Raw)} A7A5) ..FOT.. -> (${quoted} A7A5 quoted)`,
      );
      console.log(`    USDC spent    ${formatUnits6(usdcSpent)}`);
      console.log(`    A7A5 gained   ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');

      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });

    it('wA7A5 SELL two-hop (wA7A5 → USDT → USDC)', async function () {
      const wa7a5Balance = await wa7a5.balanceOf(traderAddr);
      expect(wa7a5Balance).to.be.gte(0, 'trader must hold wa7a5Balance');
      await tokens(trader).wa7a5.approve(paraSwapAddr, wa7a5Balance);
      expect(await wa7a5.allowance(traderAddr, paraSwapAddr)).to.equal(wa7a5Balance, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5Balance, V3_FEE_USDC);

      // Verify two-leg composition: facade wA7A5→USDT, then V3 USDT→USDC
      const usdtMid = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5Balance, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.USDC, usdtMid, V3_FEE_USDC);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5Balance, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5BalanceBefore, quoted, traderAddr);

      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBalanceBefore;
      const wa7a5Spent = wa7a5BalanceBefore - (await wa7a5.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits6(wa7a5Balance)} WA7A5) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits6(quoted)} USDC)`);
      console.log(`    wA7A5 spent   ${formatUnits6(wa7a5Spent)}`);
      console.log(`    USDC gained   ${formatUnits6(usdcGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');

      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });

    it('wA7A5 BUY two-hop (USDC → USDT → wA7A5)', async function () {
      expect(usdcBalanceBefore).to.be.gte(USDC_IN, 'trader must hold USDC_IN');
      await tokens(trader).usdc.approve(paraSwapAddr, USDC_IN);
      expect(await usdc.allowance(traderAddr, paraSwapAddr)).to.equal(USDC_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, V3_FEE_USDC);

      // Verify two-leg composition: V3 USDC→USDT, then facade USDT→wA7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);
      const wa7a5Out = await facade.quoteWA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(wa7a5Out).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, quoted, traderAddr);

      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5BalanceBefore;
      const usdcSpent = usdcBalanceBefore - (await usdc.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits6(USDC_IN)} USDC) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits6(quoted)} WA7A5)`);
      console.log(`    USDC spent    ${formatUnits6(usdcSpent)}`);
      console.log(`    wA7A5 gained  ${formatUnits6(wa7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');

      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → WETH)', async function () {
      expect(a7a5BalanceBefore).to.be.closeTo(A7A5_IN, 1n, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, V3_FEE_WETH);

      // Verify two-leg composition: facade A7A5→USDT, then V3 USDT→WETH.
      // ParaSwap applies 1 external FOT hit (trader→ParaSwap); the facade nets
      // out its own internal hops inside getBestQuoteA7A5PerUSDT.
      const effectiveIn = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const [usdtMid] = await facade.getBestQuoteA7A5PerUSDT.staticCall(effectiveIn, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WETH, usdtMid, V3_FEE_WETH);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, quoted, traderAddr);

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBalanceBefore;
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits6(A7A5_IN)} USDC) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits18(quoted)} WETH)`);
      console.log(`    A7A5 spent    ${formatUnits6(a7a5Spent)}`);
      console.log(`    WETH gained   ${formatUnits18(wethGained)}  (quoted ${formatUnits18(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.be.closeTo(quoted, 2n, 'actual should match quote');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });

    it('A7A5 BUY two-hop (WETH → USDT → A7A5)', async function () {
      expect(wethBalanceBefore).to.be.gte(WETH_IN, 'trader must hold WETH_IN');
      await tokens(trader).weth.approve(paraSwapAddr, WETH_IN);
      expect(await weth.allowance(traderAddr, paraSwapAddr)).to.equal(WETH_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, V3_FEE_WETH);

      // Verify two-leg composition: V3 WETH→USDT, then facade USDT→A7A5.
      // ParaSwap applies 1 external FOT hit (ParaSwap→user); the facade nets
      // out its own internal hops inside getBestQuoteA7A5PerUSDT.
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.USDT, WETH_IN, V3_FEE_WETH);
      const [a7a5Raw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      const a7a5AfterFot = await facade.getA7A5EffectiveOutput(a7a5Raw);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(a7a5AfterFot).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, (v: bigint) => checkRoundingError(v, quoted), traderAddr);

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      const wethSpent = wethBalanceBefore - (await weth.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits18(WETH_IN)} WETH) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits6(quoted)} A7A5)`);
      console.log(`    WETH spent    ${formatUnits18(wethSpent)}`);
      console.log(`    A7A5 gained   ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(wethSpent).to.equal(WETH_IN, 'should spend exactly WETH_IN');

      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });

    it('wA7A5 SELL two-hop (wA7A5 → USDT → WETH)', async function () {
      const wa7a5Balance = await wa7a5.balanceOf(traderAddr);
      expect(wa7a5Balance).to.be.gte(0, 'trader must hold wa7a5Balance');
      await tokens(trader).wa7a5.approve(paraSwapAddr, wa7a5Balance);
      expect(await wa7a5.allowance(traderAddr, paraSwapAddr)).to.equal(wa7a5Balance, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, V3_FEE_WETH);

      // Verify two-leg composition: facade wA7A5→USDT, then V3 USDT→WETH
      const usdtMid = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5Balance, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WETH, usdtMid, V3_FEE_WETH);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, quoted, traderAddr);

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBalanceBefore;
      const wa7a5Spent = wa7a5BalanceBefore - (await wa7a5.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits6(wa7a5Spent)} WA7A5) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits18(quoted)} WETH)`);
      console.log(`    wA7A5 spent   ${formatUnits6(wa7a5Spent)}`);
      console.log(`    WETH gained   ${formatUnits18(wethGained)}  (quoted ${formatUnits18(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');

      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });

    it('wA7A5 BUY two-hop (WETH → USDT → wA7A5)', async function () {
      expect(wethBalanceBefore).to.be.gte(WETH_IN, 'trader must hold WETH_IN');
      await tokens(trader).weth.approve(paraSwapAddr, WETH_IN);
      expect(await weth.allowance(traderAddr, paraSwapAddr)).to.equal(WETH_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, V3_FEE_WETH);

      // Verify two-leg composition: V3 WETH→USDT, then facade USDT→wA7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.USDT, WETH_IN, V3_FEE_WETH);
      const wa7a5Out = await facade.quoteWA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      console.log(`    USDT intermediate  ${formatUnits6(usdtMid)}`);
      expect(wa7a5Out).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, quoted, traderAddr);

      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5BalanceBefore;
      const wethSpent = wethBalanceBefore - (await weth.balanceOf(traderAddr));

      console.log(`    LEGS: (${formatUnits18(wethSpent)} WETH) -> (${formatUnits6(usdtMid)} USDT) -> (${formatUnits6(quoted)} WA7A5)`);
      console.log(`    WETH spent    ${formatUnits18(wethSpent)}`);
      console.log(`    wA7A5 gained  ${formatUnits6(wa7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(wethSpent).to.equal(WETH_IN, 'should spend exactly WETH_IN');

      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });
  });

  // ── non-zero A7A5 FOT ──────────────────────────────────────────────────────
  // basisPointsRate is 0 on mainnet. fotFixture forces it to 1% via storage
  // manipulation to exercise all balance-delta and double-FOT-hit paths.

  describe('non-zero A7A5 FOT', function () {
    let bps: bigint;
    let precision: bigint;
    let facade: PoolsFacade;

    before(function () {
      console.log(`\n\n`);
    });

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr, facade} = await loadFixture(fotFixture));
      ({usdt, a7a5, wa7a5, usdc, weth} = tokens());

      usdtBalanceBefore = await usdt.balanceOf(traderAddr);
      usdcBalanceBefore = await usdc.balanceOf(traderAddr);
      a7a5BalanceBefore = await a7a5.balanceOf(traderAddr);
      wa7a5BalanceBefore = await wa7a5.balanceOf(traderAddr);
      wethBalanceBefore = await weth.balanceOf(traderAddr);

      bps = await a7a5.basisPointsRate();
      precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);
    });

    it('A7A5 SELL (A7A5 → USDT): actual USDT == quoted with 1% FOT', async function () {
      expect(a7a5BalanceBefore).to.be.greaterThan(A7A5_IN, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      // const effectiveIn: bigint = await facade.getA7A5EffectiveOutput(A7A5_IN);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, NO_FEE);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();
      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBalanceBefore;

      await expect(tx).to.emit(paraSwap, 'Swapped').withArgs(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, usdtGained, traderAddr);

      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));

      // console.log(`    A7A5 spent ${formatUnits6(a7a5Spent)}  (effectiveIn ${formatUnits6(effectiveIn)})`);
      console.log(`    A7A5 spent ${formatUnits6(a7a5Spent)}`);
      console.log(`    USDT gained ${formatUnits6(usdtGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });

    it('A7A5 BUY (USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      expect(usdtBalanceBefore).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      await tokens(trader).usdt.approve(paraSwapAddr, USDT_IN);
      expect(await usdt.allowance(traderAddr, paraSwapAddr)).to.equal(USDT_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, NO_FEE);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, (v: bigint) => abs(v, quoted) <= 2n, traderAddr);

      const usdtSpent = usdtBalanceBefore - (await usdt.balanceOf(traderAddr));

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      console.log(`    USDT spent ${formatUnits6(usdtSpent)}`);
      console.log(`    A7A5 gained ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(usdtSpent).to.be.equal(USDT_IN, 'actual should be within 10 units of quote');

      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → USDC): actual USDC == quoted with 1% FOT', async function () {
      expect(a7a5BalanceBefore).to.gte(A7A5_IN, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const usdcBefore = await usdc.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, V3_FEE_USDC);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, (v: bigint) => abs(v, quoted) <= 2n, traderAddr);
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));
      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBefore;

      console.log(`    A7A5 spent ${formatUnits6(a7a5Spent)}`);
      console.log(`    USDC gained ${formatUnits6(usdcGained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.equal(quoted, 'actual should match quote');
      expect(a7a5Spent).to.be.closeTo(A7A5_IN, A7A5_MAX_ROUNDING_ERROR, `must spend A7A5_IN`);

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });

    it('A7A5 BUY two-hop (USDC → USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      expect(usdcBalanceBefore).to.be.gte(USDC_IN, 'trader must hold USDC_IN');
      await tokens(trader).usdc.approve(paraSwapAddr, USDC_IN);
      expect(await usdc.allowance(traderAddr, paraSwapAddr)).to.equal(USDC_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, V3_FEE_USDC);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, (v: bigint) => abs(v, quoted) <= 2n, traderAddr);

      const usdcSpent = usdcBalanceBefore - (await usdc.balanceOf(traderAddr));

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      console.log(`    USDC spent ${formatUnits6(usdcSpent)}`);
      console.log(`    A7A5 gained ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(usdcSpent).to.be.equal(USDC_IN);

      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → WETH): actual WETH == quoted with 1% FOT', async function () {
      expect(a7a5BalanceBefore).to.be.gte(A7A5_IN, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, V3_FEE_WETH);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, (v: bigint) => abs(v, quoted) <= 2n, traderAddr);

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBalanceBefore;
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));
      console.log(`    A7A5 spent ${formatUnits6(a7a5Spent)}`);
      console.log(`    WETH gained ${formatUnits18(wethGained)}  (quoted ${formatUnits18(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.equal(quoted, 'actual should match quote');
      expect(a7a5Spent).to.be.closeTo(A7A5_IN, A7A5_MAX_ROUNDING_ERROR, `must spend A7A5_IN`);

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });

    it('A7A5 BUY two-hop (WETH → USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      expect(wethBalanceBefore).to.be.gte(WETH_IN, 'trader must hold WETH_IN');
      await tokens(trader).weth.approve(paraSwapAddr, WETH_IN);
      expect(await weth.allowance(traderAddr, paraSwapAddr)).to.equal(WETH_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, V3_FEE_WETH);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, (v: bigint) => abs(v, quoted) <= 2n, traderAddr);

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      const wethSpent = wethBalanceBefore - (await weth.balanceOf(traderAddr));

      console.log(`    WETH spent ${formatUnits18(wethSpent)}`);
      console.log(`    A7A5 gained ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(wethSpent).to.be.equal(WETH_IN);

      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });

    it('A7A5 → wA7A5 (route 3 wrap): actual wA7A5 ≈ quoted with 1% FOT', async function () {
      // wrap path: 2 A7A5 FOT hits on the input (trader→ParaSwap, ParaSwap→wrapper),
      // wA7A5 output is not FOT.
      expect(a7a5BalanceBefore).to.be.gt(A7A5_IN, 'trader must hold A7A5_IN');
      await tokens(trader).a7a5.approve(paraSwapAddr, A7A5_IN);
      expect(await a7a5.allowance(traderAddr, paraSwapAddr)).to.equal(A7A5_IN, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WA7A5, A7A5_IN, NO_FEE);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WA7A5, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.WA7A5, A7A5_IN, (v: bigint) => checkRoundingError(v, quoted), traderAddr);

      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5BalanceBefore;
      const a7a5Spent = a7a5BalanceBefore - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent ${formatUnits6(a7a5Spent)}`);
      console.log(`    wA7A5 gained ${formatUnits6(wa7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.be.closeTo(quoted, A7A5_MAX_ROUNDING_ERROR, 'actual should match quote');
      expect(a7a5Spent).to.be.closeTo(A7A5_IN, A7A5_MAX_ROUNDING_ERROR, `must spend A7A5_IN`);

      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });

    it('wA7A5 → A7A5 (route 3 unwrap): actual A7A5 ≈ quoted with 1% FOT', async function () {
      // unwrap path: 2 A7A5 FOT hits on the output (wrapper→ParaSwap, ParaSwap→user),
      // wA7A5 input is not FOT.
      const wa7a5Balance = await wa7a5.balanceOf(traderAddr);
      expect(wa7a5Balance).to.be.greaterThan(0n, 'trader must hold wA7A5');
      await tokens(trader).wa7a5.approve(paraSwapAddr, wa7a5Balance);
      expect(await wa7a5.allowance(traderAddr, paraSwapAddr)).to.equal(wa7a5Balance, 'allowance must be set');

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.A7A5, wa7a5Balance, NO_FEE);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.A7A5, wa7a5Balance, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.WA7A5, ADDRESSES.A7A5, wa7a5Balance, (v: bigint) => abs(v, quoted) <= 3n, traderAddr);

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5BalanceBefore;
      const wa7a5Spent = wa7a5Balance - (await wa7a5.balanceOf(traderAddr));

      console.log(`    wA7A5 spent ${formatUnits6(wa7a5Spent)}`);
      console.log(`    A7A5 gained ${formatUnits6(a7a5Gained)}  (quoted ${formatUnits6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 3n, 'actual should match quote');
      expect(wa7a5Spent).to.be.equal(wa7a5Balance, 'must spend full wA7A5 balance');

      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });
  });

  describe('REVERTS', function () {
    let paraSwap: ParaSwap;
    let trader: HardhatEthersSigner;

    before(function () {
      console.log(`\n\n`);
    });

    beforeEach(async function () {
      ({paraSwap, trader} = await loadFixture(deployParaSwapFixture));
    });

    it('reverts ParaSwap__ZeroAmountIn when amountIn = 0', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, 0n, 0n, NO_FEE, FAR_DEADLINE)).to.be.revertedWithCustomError(
        paraSwap,
        'ParaSwap__ZeroAmountIn',
      );
    });

    it('reverts ParaSwap__Expired when deadline is in the past', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, PAST_DEADLINE)).to.be.revertedWithCustomError(
        paraSwap,
        'ParaSwap__Expired',
      );
    });

    it('reverts ParaSwap__InsufficientAllowance when caller has not approved the router', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr} = await loadFixture(fundedFixture);
      const {usdt} = tokens();
      expect(await usdt.balanceOf(tAddr)).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      expect(await usdt.allowance(tAddr, await ps.getAddress())).to.equal(0n, 'no approval should be set');
      await expect(ps.connect(t).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE)).to.be.revertedWithCustomError(
        ps,
        'ParaSwap__InsufficientAllowance',
      );
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (A7A5 path)', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr, paraSwapAddr: psAddr} = await loadFixture(fundedFixture);
      const {usdt} = tokens();
      expect(await usdt.balanceOf(tAddr)).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      await tokens(t).usdt.approve(psAddr, USDT_IN);
      expect(await usdt.allowance(tAddr, psAddr)).to.equal(USDT_IN, 'allowance must be set');
      await expect(
        ps.connect(t).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, ethers.MaxUint256, NO_FEE, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (wA7A5 path)', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr, paraSwapAddr: psAddr} = await loadFixture(fundedFixture);
      const {usdt} = tokens();
      expect(await usdt.balanceOf(tAddr)).to.be.gte(USDT_IN, 'trader must hold USDT_IN');
      await tokens(t).usdt.approve(psAddr, USDT_IN);
      expect(await usdt.allowance(tAddr, psAddr)).to.equal(USDT_IN, 'allowance must be set');
      await expect(
        ps.connect(t).swap(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, ethers.MaxUint256, V3_FEE_WA7A5, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts (V3 router) when amountOutMin exceeds actual output (generic V3 path)', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr, paraSwapAddr: psAddr} = await loadFixture(fundedFixture);
      const {usdc} = tokens();
      expect(await usdc.balanceOf(tAddr)).to.be.gte(USDC_IN, 'trader must hold USDC_IN');
      await tokens(t).usdc.approve(psAddr, USDC_IN);
      expect(await usdc.allowance(tAddr, psAddr)).to.equal(USDC_IN, 'allowance must be set');
      await expect(ps.connect(t).swap(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, ethers.MaxUint256, V3_FEE_USDC, FAR_DEADLINE)).to.revert(ethers);
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (A7A5→WETH sell)', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr, paraSwapAddr: psAddr} = await loadFixture(fundedFixture);
      const {a7a5} = tokens();
      expect(await a7a5.balanceOf(tAddr)).to.be.closeTo(A7A5_IN, 1n, 'trader must hold A7A5_IN');
      await tokens(t).a7a5.approve(psAddr, A7A5_IN);
      expect(await a7a5.allowance(tAddr, psAddr)).to.equal(A7A5_IN, 'allowance must be set');
      await expect(
        ps.connect(t).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, ethers.MaxUint256, V3_FEE_WETH, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (WETH→A7A5 buy)', async function () {
      const {paraSwap: ps, trader: t, traderAddr: tAddr, paraSwapAddr: psAddr} = await loadFixture(fundedFixture);
      const {weth} = tokens();
      expect(await weth.balanceOf(tAddr)).to.be.gte(WETH_IN, 'trader must hold WETH_IN');
      await tokens(t).weth.approve(psAddr, WETH_IN);
      expect(await weth.allowance(tAddr, psAddr)).to.equal(WETH_IN, 'allowance must be set');
      await expect(
        ps.connect(t).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, ethers.MaxUint256, V3_FEE_WETH, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });
  });
});
