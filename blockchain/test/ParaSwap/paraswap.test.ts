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
import {
  buyA7A5Fixture,
  buyWA7A5Fixture,
  deployParaSwapFixture,
  genericV3Fixture,
  sellA7A5Fixture,
  sellWA7A5Fixture,
  sellA7A5ForUSDCFixture,
  buyA7A5WithUSDCFixture,
  sellWA7A5ForUSDCFixture,
  buyWA7A5WithUSDCFixture,
  sellA7A5ForWETHFixture,
  buyA7A5WithWETHFixture,
  sellWA7A5ForWETHFixture,
  buyWA7A5WithWETHFixture,
  sellA7A5FotFixture,
  buyA7A5FotFixture,
  sellA7A5ForUSDCFotFixture,
  buyA7A5WithUSDCFotFixture,
  sellA7A5ForWETHFotFixture,
  buyA7A5WithWETHFotFixture,
} from './fixtures.js';
import {ADDRESSES} from '../../common/addresses.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';
import {IWA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IWA7A5__factory.js';
import type {ParaSwap} from '../../types/ethers-contracts/ParaSwap.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.sol/PoolsFacade.js';
import type {HardhatEthersSigner} from '@nomicfoundation/hardhat-ethers/types';
import {tokens, fmt6, fmt18, gasReport, fetchEthPrice} from './helpers.js';

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
  describe('A7A5 SELL (A7A5 → USDT)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 SELL ────────────────────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(sellA7A5Fixture));
    });

    it('trader receives USDT; A7A5 spent ≤ A7A5_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdt, a7a5} = tokens();
      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, NO_FEE);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const a7a5Spent = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent    ${fmt6(a7a5Spent)}`);
      console.log(`    USDT gained   ${fmt6(usdtGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(usdtGained).to.be.greaterThan(0n, 'should receive USDT');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });

    it('emits Swapped event with correct tokenIn/tokenOut/recipient', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE))
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, (v: bigint) => v > 0n, traderAddr);
    });
  });

  // ── A7A5 BUY (USDT → A7A5) ─────────────────────────────────────────────────

  describe('A7A5 BUY (USDT → A7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 BUY ─────────────────────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(buyA7A5Fixture));
    });

    it('trader receives A7A5; USDT spent = USDT_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdt, a7a5} = tokens();
      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, NO_FEE);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      console.log(`    USDT spent    ${fmt6(usdtSpent)}`);
      console.log(`    A7A5 gained   ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      // Double FOT (pair→ParaSwap then ParaSwap→user) has ≤1 rounding error per hit.
      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n, 'should receive A7A5');
      expect(usdtSpent).to.equal(USDT_IN, 'should spend exactly USDT_IN');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });

    it('emits Swapped event', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE)).to.emit(paraSwap, 'Swapped');
    });
  });

  // ── wA7A5 SELL (wA7A5 → USDT) ──────────────────────────────────────────────

  describe('wA7A5 SELL (wA7A5 → USDT)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let trader: HardhatEthersSigner;
    let traderAddr: string;
    let wa7a5Balance: bigint;

    before(() => console.log('\n  ── wA7A5 SELL ───────────────────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr, wa7a5Balance} = (await loadFixture(sellWA7A5Fixture)) as any);
    });

    it('trader receives USDT; wA7A5 spent = wa7a5Balance; paraSwap holds nothing; actual == quoted', async function () {
      const {usdt, wa7a5} = tokens();
      const usdtBefore = await usdt.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, V3_FEE_WA7A5);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, 0n, V3_FEE_WA7A5, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const wa7a5Spent = wa7a5Before - (await wa7a5.balanceOf(traderAddr));

      console.log(`    wA7A5 spent   ${fmt6(wa7a5Spent)}`);
      console.log(`    USDT gained   ${fmt6(usdtGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(usdtGained).to.be.greaterThan(0n, 'should receive USDT');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });
  });

  // ── wA7A5 BUY (USDT → wA7A5) ───────────────────────────────────────────────

  describe('wA7A5 BUY (USDT → wA7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── wA7A5 BUY ────────────────────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(buyWA7A5Fixture));
    });

    it('trader receives wA7A5; USDT spent = USDT_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdt, wa7a5} = tokens();
      const usdtBefore = await usdt.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, V3_FEE_WA7A5);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, 0n, V3_FEE_WA7A5, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;

      console.log(`    USDT spent    ${fmt6(usdtSpent)}`);
      console.log(`    wA7A5 gained  ${fmt6(wa7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Gained).to.be.greaterThan(0n, 'should receive wA7A5');
      expect(usdtSpent).to.equal(USDT_IN, 'should spend exactly USDT_IN');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });
  });

  // ── Generic V3 (USDC → USDT) ───────────────────────────────────────────────

  describe('Generic V3 (USDC → USDT)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── Generic V3 ───────────────────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(genericV3Fixture));
    });

    it('trader receives USDT; USDC spent = USDC_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdt, usdc} = tokens();
      const usdtBefore = await usdt.balanceOf(traderAddr);
      const usdcBefore = await usdc.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const usdcSpent = usdcBefore - (await usdc.balanceOf(traderAddr));

      console.log(`    USDC spent    ${fmt6(usdcSpent)}`);
      console.log(`    USDT gained   ${fmt6(usdtGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(usdtGained).to.be.greaterThan(0n, 'should receive USDT');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });
  });

  // ── A7A5 SELL two-hop: A7A5 → USDT → USDC ───────────────────────────────────

  describe('A7A5 SELL two-hop (A7A5 → USDT → USDC)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 SELL two-hop (USDC) ─────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(sellA7A5ForUSDCFixture)) as any);
    });

    it('trader receives USDC; A7A5 spent ≤ A7A5_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdc, usdt, a7a5} = tokens();
      const usdcBefore = await usdc.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, V3_FEE_USDC);

      // Verify two-leg composition: facade A7A5→USDT, then V3 USDT→USDC
      const effectiveIn = await facade.getA7A5EffectiveOutput(await facade.getA7A5EffectiveOutput(A7A5_IN));
      const [usdtMid] = await facade.getBestQuoteA7A5PerUSDT.staticCall(effectiveIn, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.USDC, usdtMid, V3_FEE_USDC);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBefore;
      const a7a5Spent = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent    ${fmt6(a7a5Spent)}`);
      console.log(`    USDC gained   ${fmt6(usdcGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.equal(quoted, 'actual should match quote');
      expect(usdcGained).to.be.greaterThan(0n, 'should receive USDC');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });

    it('emits Swapped event with correct tokenIn/tokenOut', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, 0n, V3_FEE_USDC, FAR_DEADLINE))
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, (v: bigint) => v > 0n, traderAddr);
    });
  });

  // ── A7A5 BUY two-hop: USDC → USDT → A7A5 ─────────────────────────────────────

  describe('A7A5 BUY two-hop (USDC → USDT → A7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 BUY two-hop (USDC) ──────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(buyA7A5WithUSDCFixture)) as any);
    });

    it('trader receives A7A5; USDC spent = USDC_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdc, usdt, a7a5} = tokens();
      const usdcBefore = await usdc.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, V3_FEE_USDC);

      // Verify two-leg composition: V3 USDC→USDT, then facade USDT→A7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);
      const [a7a5Raw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      const fot1 = await facade.getA7A5EffectiveOutput(a7a5Raw);
      const fot2 = await facade.getA7A5EffectiveOutput(fot1);
      const fot3 = await facade.getA7A5EffectiveOutput(fot2);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(fot3).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      const usdcSpent = usdcBefore - (await usdc.balanceOf(traderAddr));

      console.log(`    USDC spent    ${fmt6(usdcSpent)}`);
      console.log(`    A7A5 gained   ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n, 'should receive A7A5');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });

    it('emits Swapped event', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE)).to.emit(
        paraSwap,
        'Swapped',
      );
    });
  });

  // ── wA7A5 SELL two-hop: wA7A5 → USDT → USDC ──────────────────────────────────

  describe('wA7A5 SELL two-hop (wA7A5 → USDT → USDC)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;
    let wa7a5Balance: bigint;

    before(() => console.log('\n  ── wA7A5 SELL two-hop (USDC) ────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr, wa7a5Balance} = (await loadFixture(sellWA7A5ForUSDCFixture)) as any);
    });

    it('trader receives USDC; wA7A5 spent = wa7a5Balance; paraSwap holds nothing; actual == quoted', async function () {
      const {usdc, usdt, wa7a5} = tokens();
      const usdcBefore = await usdc.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5Balance, V3_FEE_USDC);

      // Verify two-leg composition: facade wA7A5→USDT, then V3 USDT→USDC
      const usdtMid = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5Balance, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.USDC, usdtMid, V3_FEE_USDC);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5Balance, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBefore;
      const wa7a5Spent = wa7a5Before - (await wa7a5.balanceOf(traderAddr));

      console.log(`    wA7A5 spent   ${fmt6(wa7a5Spent)}`);
      console.log(`    USDC gained   ${fmt6(usdcGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.equal(quoted, 'actual should match quote');
      expect(usdcGained).to.be.greaterThan(0n, 'should receive USDC');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });
  });

  // ── wA7A5 BUY two-hop: USDC → USDT → wA7A5 ───────────────────────────────────

  describe('wA7A5 BUY two-hop (USDC → USDT → wA7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── wA7A5 BUY two-hop (USDC) ─────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(buyWA7A5WithUSDCFixture)) as any);
    });

    it('trader receives wA7A5; USDC spent = USDC_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {usdc, usdt, wa7a5} = tokens();
      const usdcBefore = await usdc.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, V3_FEE_USDC);

      // Verify two-leg composition: V3 USDC→USDT, then facade USDT→wA7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);
      const wa7a5Out = await facade.quoteWA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(wa7a5Out).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;
      const usdcSpent = usdcBefore - (await usdc.balanceOf(traderAddr));

      console.log(`    USDC spent    ${fmt6(usdcSpent)}`);
      console.log(`    wA7A5 gained  ${fmt6(wa7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Gained).to.be.greaterThan(0n, 'should receive wA7A5');
      expect(usdcSpent).to.equal(USDC_IN, 'should spend exactly USDC_IN');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });
  });

  // ── A7A5 SELL two-hop: A7A5 → USDT → WETH ───────────────────────────────────

  describe('A7A5 SELL two-hop (A7A5 → USDT → WETH)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 SELL two-hop (WETH) ─────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(sellA7A5ForWETHFixture)) as any);
    });

    it('trader receives WETH; A7A5 spent ≤ A7A5_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {weth, usdt, a7a5} = tokens();
      const wethBefore = await weth.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, V3_FEE_WETH);

      // Verify two-leg composition: facade A7A5→USDT, then V3 USDT→WETH
      const effectiveIn = await facade.getA7A5EffectiveOutput(await facade.getA7A5EffectiveOutput(A7A5_IN));
      const [usdtMid] = await facade.getBestQuoteA7A5PerUSDT.staticCall(effectiveIn, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WETH, usdtMid, V3_FEE_WETH);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBefore;
      const a7a5Spent = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`    A7A5 spent    ${fmt6(a7a5Spent)}`);
      console.log(`    WETH gained   ${fmt18(wethGained)}  (quoted ${fmt18(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.equal(quoted, 'actual should match quote');
      expect(wethGained).to.be.greaterThan(0n, 'should receive WETH');
      expect(a7a5Spent).to.be.lessThanOrEqual(A7A5_IN, 'A7A5 spent should not exceed amountIn');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });

    it('emits Swapped event with correct tokenIn/tokenOut', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, 0n, V3_FEE_WETH, FAR_DEADLINE))
        .to.emit(paraSwap, 'Swapped')
        .withArgs(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, (v: bigint) => v > 0n, traderAddr);
    });
  });

  // ── A7A5 BUY two-hop: WETH → USDT → A7A5 ─────────────────────────────────────

  describe('A7A5 BUY two-hop (WETH → USDT → A7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── A7A5 BUY two-hop (WETH) ──────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(buyA7A5WithWETHFixture)) as any);
    });

    it('trader receives A7A5; WETH spent = WETH_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {weth, usdt, a7a5} = tokens();
      const wethBefore = await weth.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, V3_FEE_WETH);

      // Verify two-leg composition: V3 WETH→USDT, then facade USDT→A7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.USDT, WETH_IN, V3_FEE_WETH);
      const [a7a5Raw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      const fot1 = await facade.getA7A5EffectiveOutput(a7a5Raw);
      const fot2 = await facade.getA7A5EffectiveOutput(fot1);
      const fot3 = await facade.getA7A5EffectiveOutput(fot2);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(fot3).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      const wethSpent = wethBefore - (await weth.balanceOf(traderAddr));

      console.log(`    WETH spent    ${fmt18(wethSpent)}`);
      console.log(`    A7A5 gained   ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n, 'should receive A7A5');
      expect(wethSpent).to.equal(WETH_IN, 'should spend exactly WETH_IN');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 in router');
    });

    it('emits Swapped event', async function () {
      await expect(paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE)).to.emit(
        paraSwap,
        'Swapped',
      );
    });
  });

  // ── wA7A5 SELL two-hop: wA7A5 → USDT → WETH ──────────────────────────────────

  describe('wA7A5 SELL two-hop (wA7A5 → USDT → WETH)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;
    let wa7a5Balance: bigint;

    before(() => console.log('\n  ── wA7A5 SELL two-hop (WETH) ────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr, wa7a5Balance} = (await loadFixture(sellWA7A5ForWETHFixture)) as any);
    });

    it('trader receives WETH; wA7A5 spent = wa7a5Balance; paraSwap holds nothing; actual == quoted', async function () {
      const {weth, usdt, wa7a5} = tokens();
      const wethBefore = await weth.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, V3_FEE_WETH);

      // Verify two-leg composition: facade wA7A5→USDT, then V3 USDT→WETH
      const usdtMid = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5Balance, 1n /*SELL*/);
      const leg2 = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.WETH, usdtMid, V3_FEE_WETH);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(leg2).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBefore;
      const wa7a5Spent = wa7a5Before - (await wa7a5.balanceOf(traderAddr));

      console.log(`    wA7A5 spent   ${fmt6(wa7a5Spent)}`);
      console.log(`    WETH gained   ${fmt18(wethGained)}  (quoted ${fmt18(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.equal(quoted, 'actual should match quote');
      expect(wethGained).to.be.greaterThan(0n, 'should receive WETH');
      expect(wa7a5Spent).to.equal(wa7a5Balance, 'should spend exact wA7A5 balance');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });
  });

  // ── wA7A5 BUY two-hop: WETH → USDT → wA7A5 ───────────────────────────────────

  describe('wA7A5 BUY two-hop (WETH → USDT → wA7A5)', function () {
    let paraSwap: ParaSwap;
    let paraSwapAddr: string;
    let facade: PoolsFacade;
    let trader: HardhatEthersSigner;
    let traderAddr: string;

    before(() => console.log('\n  ── wA7A5 BUY two-hop (WETH) ─────────────────────────'));

    beforeEach(async function () {
      ({paraSwap, paraSwapAddr, facade, trader, traderAddr} = (await loadFixture(buyWA7A5WithWETHFixture)) as any);
    });

    it('trader receives wA7A5; WETH spent = WETH_IN; paraSwap holds nothing; actual == quoted', async function () {
      const {weth, usdt, wa7a5} = tokens();
      const wethBefore = await weth.balanceOf(traderAddr);
      const wa7a5Before = await wa7a5.balanceOf(traderAddr);

      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, V3_FEE_WETH);

      // Verify two-leg composition: V3 WETH→USDT, then facade USDT→wA7A5
      const usdtMid = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.USDT, WETH_IN, V3_FEE_WETH);
      const wa7a5Out = await facade.quoteWA7A5PerUSDT.staticCall(usdtMid, 0n /*BUY*/);
      console.log(`    USDT intermediate  ${fmt6(usdtMid)}`);
      expect(wa7a5Out).to.equal(quoted, 'leg1+leg2 composition should match full quote');

      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const wa7a5Gained = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;
      const wethSpent = wethBefore - (await weth.balanceOf(traderAddr));

      console.log(`    WETH spent    ${fmt18(wethSpent)}`);
      console.log(`    wA7A5 gained  ${fmt6(wa7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas           ${gasReport(receipt!, ethUsd)}`);

      expect(wa7a5Gained).to.equal(quoted, 'actual should match quote');
      expect(wa7a5Gained).to.be.greaterThan(0n, 'should receive wA7A5');
      expect(wethSpent).to.equal(WETH_IN, 'should spend exactly WETH_IN');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await wa7a5.balanceOf(paraSwapAddr)).to.equal(0n, 'no wA7A5 left in router');
    });
  });

  // ── non-zero A7A5 FOT ──────────────────────────────────────────────────────
  // basisPointsRate is 0 on mainnet. These fixtures force it to 1% via storage
  // manipulation to exercise all balance-delta and double-FOT-hit paths.
  // A7A5/WETH is used as the generic two-hop pair for all FOT scenarios.

  describe('non-zero A7A5 FOT', function () {
    before(() => console.log('\n  ── non-zero A7A5 FOT ────────────────────────────────'));

    it('A7A5 SELL (A7A5 → USDT): actual USDT == quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(sellA7A5FotFixture);
      const {usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const usdtBefore = await usdt.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, NO_FEE);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      console.log(`    USDT gained ${fmt6(usdtGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(usdtGained).to.equal(quoted, 'actual should match quote');
      expect(usdtGained).to.be.greaterThan(0n);
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
    });

    it('A7A5 BUY (USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(buyA7A5FotFixture);
      const {usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const a7a5Before = await a7a5.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, NO_FEE);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE);
      const receipt = await tx.wait();

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      console.log(`    A7A5 gained ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n);
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → USDC): actual USDC == quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(sellA7A5ForUSDCFotFixture);
      const {usdc, usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const usdcBefore = await usdc.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, V3_FEE_USDC);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const usdcGained = (await usdc.balanceOf(traderAddr)) - usdcBefore;
      console.log(`    USDC gained ${fmt6(usdcGained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(usdcGained).to.equal(quoted, 'actual should match quote');
      expect(usdcGained).to.be.greaterThan(0n);
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
    });

    it('A7A5 BUY two-hop (USDC → USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(buyA7A5WithUSDCFotFixture);
      const {usdc, usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const a7a5Before = await a7a5.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, V3_FEE_USDC);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, 0n, V3_FEE_USDC, FAR_DEADLINE);
      const receipt = await tx.wait();

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      console.log(`    A7A5 gained ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n);
      expect(await usdc.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDC left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });

    it('A7A5 SELL two-hop (A7A5 → USDT → WETH): actual WETH == quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(sellA7A5ForWETHFotFixture);
      const {weth, usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const wethBefore = await weth.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, V3_FEE_WETH);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const wethGained = (await weth.balanceOf(traderAddr)) - wethBefore;
      console.log(`    WETH gained ${fmt18(wethGained)}  (quoted ${fmt18(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(wethGained).to.equal(quoted, 'actual should match quote');
      expect(wethGained).to.be.greaterThan(0n);
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
    });

    it('A7A5 BUY two-hop (WETH → USDT → A7A5): actual A7A5 ≈ quoted with 1% FOT', async function () {
      const {paraSwap, paraSwapAddr, trader, traderAddr} = await loadFixture(buyA7A5WithWETHFotFixture);
      const {weth, usdt, a7a5} = tokens();

      const bps = await a7a5.basisPointsRate();
      const precision = await a7a5.FEE_PRECISION();
      expect(bps, 'FOT must be active').to.be.greaterThan(0n);
      console.log(`    FOT rate: ${bps}/${precision}  (${(Number(bps) / Number(precision)) * 100}%)`);

      const a7a5Before = await a7a5.balanceOf(traderAddr);
      const quoted = await paraSwap.connect(trader).quote.staticCall(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, V3_FEE_WETH);
      const tx = await paraSwap.connect(trader).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, 0n, V3_FEE_WETH, FAR_DEADLINE);
      const receipt = await tx.wait();

      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;
      console.log(`    A7A5 gained ${fmt6(a7a5Gained)}  (quoted ${fmt6(quoted)})`);
      console.log(`    gas         ${gasReport(receipt!, ethUsd)}`);

      expect(a7a5Gained).to.be.closeTo(quoted, 10n, 'actual should be within 10 units of quote');
      expect(a7a5Gained).to.be.greaterThan(0n);
      expect(await weth.balanceOf(paraSwapAddr)).to.equal(0n, 'no WETH left in router');
      expect(await usdt.balanceOf(paraSwapAddr)).to.equal(0n, 'no USDT left in router');
      expect(await a7a5.balanceOf(paraSwapAddr)).to.be.lessThanOrEqual(1n, 'at most 1 wei A7A5 dust');
    });
  });

  // ── REVERTS ────────────────────────────────────────────────────────────────

  describe('REVERTS', function () {
    let paraSwap: ParaSwap;
    let trader: HardhatEthersSigner;

    before(() => console.log('\n  ── REVERTS ──────────────────────────────────────────'));

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
      await expect(paraSwap.connect(trader).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, 0n, NO_FEE, FAR_DEADLINE)).to.be.revertedWithCustomError(
        paraSwap,
        'ParaSwap__InsufficientAllowance',
      );
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (A7A5 path)', async function () {
      const {paraSwap: ps, trader: t} = await loadFixture(buyA7A5Fixture);
      await expect(
        ps.connect(t).swap(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, ethers.MaxUint256, NO_FEE, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (wA7A5 path)', async function () {
      const {paraSwap: ps, trader: t} = await loadFixture(buyWA7A5Fixture);
      await expect(
        ps.connect(t).swap(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, ethers.MaxUint256, V3_FEE_WA7A5, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts (V3 router) when amountOutMin exceeds actual output (generic V3 path)', async function () {
      const {paraSwap: ps, trader: t} = await loadFixture(genericV3Fixture);
      await expect(ps.connect(t).swap(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, ethers.MaxUint256, V3_FEE_USDC, FAR_DEADLINE)).to.revert(ethers);
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (A7A5→WETH sell)', async function () {
      const {paraSwap: ps, trader: t} = await loadFixture(sellA7A5ForWETHFixture);
      await expect(
        ps.connect(t).swap(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, ethers.MaxUint256, V3_FEE_WETH, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });

    it('reverts ParaSwap__InsufficientOutput when amountOutMin exceeds actual output (WETH→A7A5 buy)', async function () {
      const {paraSwap: ps, trader: t} = await loadFixture(buyA7A5WithWETHFixture);
      await expect(
        ps.connect(t).swap(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, ethers.MaxUint256, V3_FEE_WETH, FAR_DEADLINE),
      ).to.be.revertedWithCustomError(ps, 'ParaSwap__InsufficientOutput');
    });
  });
});
