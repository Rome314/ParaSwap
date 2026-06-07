import {expect} from 'chai';
import {ethers, FAR_DEADLINE, loadFixture, PAST_DEADLINE, SIDE, STRATEGY, USDT_IN, A7A5_IN} from './consts.js';
import {buyFixture, deployFacadeFixture, sellFixture} from './fixtures.js';
import {gasUsedEthStr, revertMsg, setV2Reserve, tokens} from './helpers.js';
import {ADDRESSES} from '../../common/addresses.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.js';
import type {HardhatEthersSigner} from '@nomicfoundation/hardhat-ethers/types';
import type {IA7A5} from '../../types/ethers-contracts/index.js';
import {formatUnits6} from '../helpers.js';

// ── swapA7A5AtBestQuote ───────────────────────────────────────────────
describe('swapA7A5AtBestQuote', function () {
  let facade: PoolsFacade;
  let facadeAddr: string;
  let trader: HardhatEthersSigner;
  let traderAddr: string;
  let usdt: IA7A5;
  let a7a5: IA7A5;

  // ── BUY ──────────────────────────────────────────────────────────────
  describe('BUY', function () {
    const side = SIDE.BUY;

    before(() => console.log('\n  ── swapA7A5AtBestQuote BUY ─────────────────────────'));

    it('DIRECT path: trader receives A7A5 and spends USDT_IN', async () => {
      console.log('\n  ── BUY DIRECT — depleted V2 USDT reserve ───────────────');
      // Lower the stored USDT reserve (r1) far below its actual on-chain balance
      // (~36 K USDT).  The AMM formula sees a near-zero rIn, so it quotes an
      // enormous A7A5/USDT rate → DIRECT beats MIXED.  The actual pair USDT
      // balance stays untouched, so the pair can execute and the K check passes.
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      ({usdt, a7a5} = tokens());

      const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, null, 1_000_000_000n);

      const [a7a5Expected, strategyRaw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(USDT_IN, side);
      expect(Number(strategyRaw), 'DIRECT must be elected with depleted USDT reserve').to.equal(STRATEGY.DIRECT);

      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const receipt = await (await facade.connect(trader).swapA7A5AtBestQuote(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      console.log(`        strategy    DIRECT`);
      console.log(`        a7a5Gained  ${formatUnits6(a7a5Gained)} A7A5`);
      console.log(`        usdtSpent   ${formatUnits6(usdtSpent)} USDT`);
      console.log(`        gas used    ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained, 'trader must gain A7A5').to.be.closeTo(a7a5Expected, 2n);
      expect(usdtSpent, 'trader must spend exactly USDT_IN').to.equal(USDT_IN);

      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await a7a5.balanceOf(facadeAddr), 'facade must hold no A7A5').to.equal(0n);

      await snap.restore();
    });

    it('MIXED path: trader receives A7A5 via V3+unwrap when V2 A7A5 reserve is nearly empty', async () => {
      console.log('\n  ── BUY MIXED — depleted V2 A7A5 reserve ───────────────');
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      ({usdt, a7a5} = tokens());

      const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, 1000n, null);

      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const [a7a5Expected, strategyRaw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(USDT_IN, side);
      expect(Number(strategyRaw), 'DIRECT must be elected with depleted USDT reserve').to.equal(STRATEGY.MIXED);

      const receipt = await (await facade.connect(trader).swapA7A5AtBestQuote(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtSpent = usdtBefore - (await usdt.balanceOf(traderAddr));
      const a7a5Gained = (await a7a5.balanceOf(traderAddr)) - a7a5Before;

      console.log(`        a7a5Gained  ${formatUnits6(a7a5Gained)} A7A5  (via V3+unwrap)`);
      console.log(`        usdtSpent   ${formatUnits6(usdtSpent)} USDT`);
      console.log(`        gas used    ${gasUsedEthStr(receipt)} ETH`);

      expect(a7a5Gained, 'trader must gain A7A5 via MIXED path').to.be.closeTo(a7a5Expected, 2n);
      expect(usdtSpent, 'trader must spend exactly USDT_IN').to.equal(USDT_IN);

      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      // ≤ 1 wei tolerance: wA7A5↔A7A5 rate integer division may leave 1-wei dust
      expect(await a7a5.balanceOf(facadeAddr), 'facade must hold no A7A5 (≤ 1 wei dust)').to.be.lessThanOrEqual(1n);

      await snap.restore();
    });
  });

  // ── SELL ─────────────────────────────────────────────────────────────
  describe('SELL', function () {
    const side = SIDE.SELL;

    before(() => console.log('\n  ── swapA7A5AtBestQuote SELL ────────────────────────'));

    it('DIRECT path: trader receives USDT and spends A7A5_IN', async () => {
      console.log('\n  ── SELL DIRECT — depleted V2 A7A5 reserve ──────────────');
      // Lower the stored A7A5 reserve (r0) far below its actual on-chain balance
      // (~2.79 M A7A5).  The AMM formula sees a near-zero rIn, so it quotes an
      // enormous USDT/A7A5 rate → DIRECT beats MIXED.  The actual pair A7A5
      // balance stays untouched, so the pair can execute and the K check passes.
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(sellFixture));
      ({usdt, a7a5} = tokens());

      const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, 1_000_000_000n, null);

      const [usdtExpected, strategyRaw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(A7A5_IN, side);
      expect(Number(strategyRaw), 'DIRECT must be elected with depleted A7A5 reserve').to.equal(STRATEGY.DIRECT);

      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const receipt = await (await facade.connect(trader).swapA7A5AtBestQuote(A7A5_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const a7a5Spent = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`        strategy    DIRECT`);
      console.log(`        usdtGained  ${formatUnits6(usdtGained)} USDT`);
      console.log(`        a7a5Spent   ${formatUnits6(a7a5Spent)} A7A5`);
      console.log(`        gas used    ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'trader must gain USDT').to.be.equal(usdtExpected);
      expect(a7a5Spent, 'trader must spend ≤ A7A5_IN').to.be.lessThanOrEqual(A7A5_IN);
      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await a7a5.balanceOf(facadeAddr), 'facade must hold no A7A5').to.equal(0n);

      await snap.restore();
    });

    it('MIXED path: trader receives USDT via wrap+V3 when V2 USDT reserve is nearly empty', async () => {
      console.log('\n  ── SELL MIXED — depleted V2 USDT reserve ───────────────');
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(sellFixture));
      ({usdt, a7a5} = tokens());

      const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, null, 1000n);

      const [usdtExpected, strategyRaw] = await facade.getBestQuoteA7A5PerUSDT.staticCall(A7A5_IN, side);
      expect(Number(strategyRaw), 'DIRECT must be elected with depleted USDT reserve').to.equal(STRATEGY.MIXED);

      const usdtBefore = await usdt.balanceOf(traderAddr);
      const a7a5Before = await a7a5.balanceOf(traderAddr);

      const receipt = await (await facade.connect(trader).swapA7A5AtBestQuote(A7A5_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtGained = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const a7a5Spent = a7a5Before - (await a7a5.balanceOf(traderAddr));

      console.log(`        usdtGained  ${formatUnits6(usdtGained)} USDT  (via wrap+V3)`);
      console.log(`        a7a5Spent   ${formatUnits6(a7a5Spent)} A7A5`);
      console.log(`        gas used    ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'trader must gain USDT via MIXED path').to.be.equal(usdtExpected);
      expect(a7a5Spent, 'trader must spend ≤ A7A5_IN').to.be.lessThanOrEqual(A7A5_IN);
      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);

      await snap.restore();
    });
  });

  // ── REVERTS ──────────────────────────────────────────────────────────
  describe('REVERTS', function () {
    before(() => console.log('\n  ── swapA7A5AtBestQuote REVERTS ─────────────────────'));

    it("reverts 'zero amountIn' when called with amountIn == 0", async () => {
      console.log('\n  ── swapA7A5AtBestQuote — zero amountIn ─────────────────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const buyMsg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(0n, SIDE.BUY, 0n, FAR_DEADLINE));
      const sellMsg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(0n, SIDE.SELL, 0n, FAR_DEADLINE));
      console.log(`        BUY:  ${buyMsg.slice(0, 80)}`);
      console.log(`        SELL: ${sellMsg.slice(0, 80)}`);
      expect(buyMsg).to.contain('zero amountIn');
      expect(sellMsg).to.contain('zero amountIn');
    });

    it("reverts 'expired' when deadline is in the past", async () => {
      console.log('\n  ── swapA7A5AtBestQuote — expired deadline ──────────────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const buyMsg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(USDT_IN, SIDE.BUY, 0n, PAST_DEADLINE));
      const sellMsg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(A7A5_IN, SIDE.SELL, 0n, PAST_DEADLINE));
      console.log(`        BUY:  ${buyMsg.slice(0, 80)}`);
      console.log(`        SELL: ${sellMsg.slice(0, 80)}`);
      expect(buyMsg).to.contain('expired');
      expect(sellMsg).to.contain('expired');
    });

    it("reverts 'insufficient allowance' when USDT allowance is zero (BUY)", async () => {
      console.log('\n  ── swapA7A5AtBestQuote — no USDT allowance (BUY) ──────');
      const {facade, trader} = await loadFixture(deployFacadeFixture);
      const msg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
      console.log(`        revert: ${msg.slice(0, 80)}`);
      expect(msg).to.contain('insufficient allowance');
    });

    it("reverts 'insufficient output' when amountOutMin exceeds actual output (BUY)", async () => {
      console.log('\n  ── swapA7A5AtBestQuote — amountOutMin too high (BUY) ───');
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      const msg = await revertMsg(facade.connect(trader).swapA7A5AtBestQuote.staticCall(USDT_IN, SIDE.BUY, ethers.MaxUint256, FAR_DEADLINE));
      console.log(`        revert: ${msg.slice(0, 80)}`);
      expect(msg).to.contain('insufficient output');
    });
  });
});
