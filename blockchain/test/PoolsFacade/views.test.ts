import {expect} from 'chai';
import {fundFromWhale, forkReady} from '../helpers.js';
import {A7A5_IN, conn, ethers, FAR_DEADLINE, loadFixture, provider, SIDE, STRATEGY, USDT_IN, WA7A5_IN} from './consts.js';
import {deployFacadeFixture} from './fixtures.js';
import {ADDRESSES} from '../../common/addresses.js';
import {readV2Reserves, revertMsg, setV2Reserve, tokens, zeroV2Reserves} from './helpers.js';

describe('quote', function () {
  if (!forkReady(ADDRESSES.A7A5, ADDRESSES.WA7A5)) {
    it.skip('requires MAINNET_FORK=1 and real A7A5/WA7A5 addresses', () => {
      console.log('MAINNET_FORK=1 and real A7A5/WA7A5 addresses');
    });
    return;
  }

  it('quoteA7A5PerUSDT BUY: positive output ≤ V2 spot, within 10% of spot', async () => {
    console.log('\n  ── quoteA7A5PerUSDT BUY ───────────────────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const out: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, SIDE.BUY);
    const {reserveA7A5: rA, reserveUsdt: rU} = await readV2Reserves(provider, ADDRESSES.V2_PAIR_USDT_A7A5);
    const spotA7A5PerUsdt = (rA * USDT_IN) / rU;
    console.log(`        amountIn        ${ethers.formatUnits(USDT_IN, 6)} USDT`);
    console.log(`        quoteOut        ${ethers.formatUnits(out, 6)} A7A5`);
    console.log(`        spot (no-fee)   ${ethers.formatUnits(spotA7A5PerUsdt, 6)} A7A5`);
    expect(out, 'output must be positive').to.be.greaterThan(0n);
    expect(out, 'output must be ≤ spot').to.be.lessThanOrEqual(spotA7A5PerUsdt);
    expect(out * 100n, 'output must be ≥ 90% of spot').to.be.greaterThanOrEqual(spotA7A5PerUsdt * 90n);
  });

  it('quoteA7A5PerUSDT SELL: positive output ≤ V2 spot equivalent', async () => {
    console.log('\n  ── quoteA7A5PerUSDT SELL ──────────────────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const out: bigint = await facade.quoteA7A5PerUSDT(A7A5_IN, SIDE.SELL);
    const {reserveA7A5: rA, reserveUsdt: rU} = await readV2Reserves(provider, ADDRESSES.V2_PAIR_USDT_A7A5);
    const spotUsdtOut = (A7A5_IN * rU) / rA;
    console.log(`        amountIn        ${ethers.formatUnits(A7A5_IN, 6)} A7A5`);
    console.log(`        quoteOut        ${ethers.formatUnits(out, 6)} USDT`);
    console.log(`        spot (no-fee)   ${ethers.formatUnits(spotUsdtOut, 6)} USDT`);
    expect(out, 'output must be positive').to.be.greaterThan(0n);
    expect(out, 'output must be ≤ spot').to.be.lessThanOrEqual(spotUsdtOut);
    expect(out * 100n, 'output must be ≥ 90% of spot').to.be.greaterThanOrEqual(spotUsdtOut * 90n);
  });

  it("quoteA7A5PerUSDT: reverts 'PoolsFacade: empty reserves' when V2 reserves are zero", async () => {
    console.log('\n  ── quoteA7A5PerUSDT: empty reserves ───────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const snap = await zeroV2Reserves(ADDRESSES.V2_PAIR_USDT_A7A5);
    const msg = await revertMsg(facade.quoteA7A5PerUSDT(USDT_IN, SIDE.BUY));
    console.log(`        revert msg: ${msg.slice(0, 80)}`);
    expect(msg).to.contain('EmptyReserves');
    await snap.restore();
  });

  it('quoteWA7A5PerUSDT BUY: positive wA7A5 output from V3 quoter', async () => {
    console.log('\n  ── quoteWA7A5PerUSDT BUY ──────────────────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const out: bigint = await facade.quoteWA7A5PerUSDT.staticCall(USDT_IN, SIDE.BUY);
    console.log(`        amountIn  ${ethers.formatUnits(USDT_IN, 6)} USDT`);
    console.log(`        quoteOut  ${ethers.formatUnits(out, 6)} wA7A5`);
    expect(out, 'wA7A5 output must be positive').to.be.greaterThan(0n);
  });

  it('quoteWA7A5PerUSDT SELL: positive USDT output from V3 quoter', async () => {
    console.log('\n  ── quoteWA7A5PerUSDT SELL ─────────────────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const {wa7a5} = tokens();
    const wa7a5In: bigint = await wa7a5.getwA7A5ByA7A5(A7A5_IN);
    const out: bigint = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5In, SIDE.SELL);
    console.log(`        wA7A5 input  ${ethers.formatUnits(wa7a5In, 6)} wA7A5`);
    console.log(`        quoteOut     ${ethers.formatUnits(out, 6)} USDT`);
    expect(out, 'USDT output must be positive').to.be.greaterThan(0n);
  });

  it('getA7A5EffectiveOutput: deducts transfer tax correctly', async () => {
    console.log('\n  ── getA7A5EffectiveOutput ─────────────────────────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const {a7a5} = tokens();
    const bps: bigint = await a7a5.basisPointsRate();
    const precision: bigint = await a7a5.FEE_PRECISION();
    const effectiveOut: bigint = await facade.getA7A5EffectiveOutput(A7A5_IN);
    const expected: bigint = (A7A5_IN * (precision - bps)) / precision;
    console.log(`        grossIn       ${ethers.formatUnits(A7A5_IN, 6)} A7A5`);
    console.log(`        effectiveOut  ${ethers.formatUnits(effectiveOut, 6)} A7A5`);
    console.log(`        fee deducted  ${ethers.formatUnits(A7A5_IN - effectiveOut, 6)} A7A5  (${bps}/${precision})`);
    expect(effectiveOut, 'effectiveOut must be ≤ grossIn').to.be.lessThanOrEqual(A7A5_IN);
    expect(effectiveOut, 'effectiveOut must match manual calc').to.equal(expected);
  });

  it('getBestQuoteA7A5PerUSDT BUY: returns max(direct, mixed) with correct strategy tag', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT BUY — cross-verify ─────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const {wa7a5} = tokens();
    const outDirect: bigint = await facade.quoteA7A5PerUSDT(USDT_IN, SIDE.BUY);
    const outWa7a5: bigint = await facade.quoteWA7A5PerUSDT.staticCall(USDT_IN, SIDE.BUY);
    const outMixed: bigint = await wa7a5.getA7A5BywA7A5(outWa7a5);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(USDT_IN, SIDE.BUY);
    const expectedBest = outDirect >= outMixed ? outDirect : outMixed;
    const expectedStrat = outDirect >= outMixed ? STRATEGY.DIRECT : STRATEGY.MIXED;
    const stratLabel = strategyRaw === 0n ? 'DIRECT' : 'MIXED';
    console.log(`        outDirect  ${ethers.formatUnits(outDirect, 6)} A7A5`);
    console.log(`        outMixed   ${ethers.formatUnits(outMixed, 6)} A7A5  (via ${ethers.formatUnits(outWa7a5, 6)} wA7A5)`);
    console.log(`        winner     ${stratLabel}  →  ${ethers.formatUnits(amountOut, 6)} A7A5`);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    expect(amountOut, 'amountOut must equal max(direct, mixed)').to.equal(expectedBest);
    expect(Number(strategyRaw), 'strategy tag must match winner').to.equal(expectedStrat);
  });

  it('getBestQuoteA7A5PerUSDT SELL: returns max(direct, mixed) with correct strategy tag', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT SELL — cross-verify ────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const {wa7a5} = tokens();
    const outDirect: bigint = await facade.quoteA7A5PerUSDT(A7A5_IN, SIDE.SELL);
    const wa7a5In: bigint = await wa7a5.getwA7A5ByA7A5(A7A5_IN);
    const outMixed: bigint = await facade.quoteWA7A5PerUSDT.staticCall(wa7a5In, SIDE.SELL);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(A7A5_IN, SIDE.SELL);
    const expectedBest = outDirect >= outMixed ? outDirect : outMixed;
    const expectedStrat = outDirect >= outMixed ? STRATEGY.DIRECT : STRATEGY.MIXED;
    const stratLabel = strategyRaw === 0n ? 'DIRECT' : 'MIXED';
    console.log(`        outDirect   ${ethers.formatUnits(outDirect, 6)} USDT`);
    console.log(`        outMixed    ${ethers.formatUnits(outMixed, 6)} USDT  (wA7A5 input: ${ethers.formatUnits(wa7a5In, 6)})`);
    console.log(`        winner      ${stratLabel}  →  ${ethers.formatUnits(amountOut, 6)} USDT`);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    expect(amountOut, 'amountOut must equal max(direct, mixed)').to.equal(expectedBest);
    expect(Number(strategyRaw), 'strategy tag must match winner').to.equal(expectedStrat);
  });

  it('getBestQuoteA7A5PerUSDT BUY: elects MIXED when V2 A7A5 reserve is nearly empty', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT BUY — force MIXED ──────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, 1000n, null);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(USDT_IN, SIDE.BUY);
    console.log(`        strategy   ${strategyRaw === 0n ? 'DIRECT' : 'MIXED'}`);
    console.log(`        amountOut  ${ethers.formatUnits(amountOut, 6)} A7A5`);
    expect(Number(strategyRaw), 'strategy must be MIXED').to.equal(STRATEGY.MIXED);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    await snap.restore();
  });

  it('getBestQuoteA7A5PerUSDT SELL: elects MIXED when V2 USDT reserve is nearly empty', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT SELL — force MIXED ─────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, null, 1000n);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(A7A5_IN, SIDE.SELL);
    console.log(`        strategy   ${strategyRaw === 0n ? 'DIRECT' : 'MIXED'}`);
    console.log(`        amountOut  ${ethers.formatUnits(amountOut, 6)} USDT`);
    expect(Number(strategyRaw), 'strategy must be MIXED').to.equal(STRATEGY.MIXED);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    await snap.restore();
  });

  it('getBestQuoteA7A5PerUSDT SELL: elects DIRECT when V2 USDT reserve is massively inflated', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT SELL — force DIRECT ────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const hugeReserve1 = 10n ** 24n;
    const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, null, hugeReserve1);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(A7A5_IN, SIDE.SELL);
    console.log(`        inflated V2 USDT reserve  ${hugeReserve1}`);
    console.log(`        strategy   ${strategyRaw === 0n ? 'DIRECT' : 'MIXED'}`);
    console.log(`        amountOut  ${ethers.formatUnits(amountOut, 6)} USDT`);
    expect(Number(strategyRaw), 'strategy must be DIRECT').to.equal(STRATEGY.DIRECT);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    await snap.restore();
  });

  it('getBestQuoteA7A5PerUSDT BUY: elects DIRECT when V2 A7A5 reserve is massively inflated', async () => {
    console.log('\n  ── getBestQuoteA7A5PerUSDT BUY — force DIRECT ─────────');
    const {facade} = await loadFixture(deployFacadeFixture);
    const hugeReserve = 10n ** 24n;
    const snap = await setV2Reserve(ADDRESSES.V2_PAIR_USDT_A7A5, hugeReserve, null);
    const [amountOut, strategyRaw]: [bigint, bigint] = await facade.getBestQuoteA7A5PerUSDT.staticCall(USDT_IN, SIDE.BUY);
    console.log(`        inflated V2 A7A5 reserve  ${hugeReserve}`);
    console.log(`        strategy   ${strategyRaw === 0n ? 'DIRECT' : 'MIXED'}`);
    console.log(`        amountOut  ${ethers.formatUnits(amountOut, 6)} A7A5`);
    expect(Number(strategyRaw), 'strategy must be DIRECT').to.equal(STRATEGY.DIRECT);
    expect(amountOut, 'amountOut must be positive').to.be.greaterThan(0n);
    await snap.restore();
  });
});

describe('allowances', function () {
  if (!forkReady(ADDRESSES.A7A5, ADDRESSES.WA7A5)) {
    it.skip('requires MAINNET_FORK=1 and real A7A5/WA7A5 addresses', () => {});
    return;
  }

  it('allowanceUSDT / A7A5 / WA7A5 all return 0 before any approval', async () => {
    console.log('\n  ── Allowance helpers: default zero ────────────────────');
    const {facade, traderAddr} = await loadFixture(deployFacadeFixture);
    const u = await facade.allowanceUSDT(traderAddr);
    const a = await facade.allowanceA7A5(traderAddr);
    const w = await facade.allowanceWA7A5(traderAddr);
    console.log(`        allowanceUSDT   ${u}`);
    console.log(`        allowanceA7A5   ${a}`);
    console.log(`        allowanceWA7A5  ${w}`);
    expect(u, 'USDT allowance must be 0').to.equal(0n);
    expect(a, 'A7A5 allowance must be 0').to.equal(0n);
    expect(w, 'wA7A5 allowance must be 0').to.equal(0n);
  });

  it('allowance helpers reflect exact approved amounts and are independent of each other', async () => {
    console.log('\n  ── Allowance helpers: exact amounts ───────────────────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {usdt, a7a5, wa7a5} = tokens();

    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
    expect(await facade.allowanceUSDT(traderAddr), 'USDT').to.equal(USDT_IN);
    expect(await facade.allowanceA7A5(traderAddr), 'A7A5 must still be 0').to.equal(0n);
    expect(await facade.allowanceWA7A5(traderAddr), 'wA7A5 must still be 0').to.equal(0n);
    console.log(`        USDT only:   allowanceUSDT=${USDT_IN}  A7A5=0  wA7A5=0  ✓`);

    await (usdt.connect(trader) as any).approve(facadeAddr, 0n);
    await (a7a5.connect(trader) as any).approve(facadeAddr, A7A5_IN);
    expect(await facade.allowanceUSDT(traderAddr), 'USDT must be 0').to.equal(0n);
    expect(await facade.allowanceA7A5(traderAddr), 'A7A5').to.equal(A7A5_IN);
    expect(await facade.allowanceWA7A5(traderAddr), 'wA7A5 must still be 0').to.equal(0n);
    console.log(`        A7A5 only:   allowanceUSDT=0  A7A5=${A7A5_IN}  wA7A5=0  ✓`);

    await (a7a5.connect(trader) as any).approve(facadeAddr, 0n);
    await (wa7a5.connect(trader) as any).approve(facadeAddr, WA7A5_IN);
    expect(await facade.allowanceUSDT(traderAddr), 'USDT must be 0').to.equal(0n);
    expect(await facade.allowanceA7A5(traderAddr), 'A7A5 must be 0').to.equal(0n);
    expect(await facade.allowanceWA7A5(traderAddr), 'wA7A5').to.equal(WA7A5_IN);
    console.log(`        wA7A5 only:  allowanceUSDT=0  A7A5=0  wA7A5=${WA7A5_IN}  ✓`);
  });

  it('allowanceUSDT drops to zero after revoking approval', async () => {
    console.log('\n  ── Allowance helpers: revoke → 0 ──────────────────────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();
    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
    expect(await facade.allowanceUSDT(traderAddr)).to.equal(USDT_IN);
    await (usdt.connect(trader) as any).approve(facadeAddr, 0n);
    expect(await facade.allowanceUSDT(traderAddr), 'must be 0 after revoke').to.equal(0n);
    console.log('        approved → revoked → 0  ✓');
  });

  it('allowanceUSDT returns MaxUint256 for an unlimited approval', async () => {
    console.log('\n  ── Allowance helpers: MaxUint256 ──────────────────────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();
    await (usdt.connect(trader) as any).approve(facadeAddr, ethers.MaxUint256);
    const al = await facade.allowanceUSDT(traderAddr);
    console.log(`        allowanceUSDT = ${al}`);
    expect(al).to.equal(ethers.MaxUint256);
  });

  it("allowanceUSDT(address(0)) returns 0 independent of trader's approval", async () => {
    console.log('\n  ── Allowance helpers: owner arg independence ──────────');
    const {facade, facadeAddr, trader} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();
    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
    const al = await facade.allowanceUSDT(ethers.ZeroAddress);
    console.log(`        allowanceUSDT(ZeroAddress) = ${al}  (trader's = ${USDT_IN})`);
    expect(al, 'ZeroAddress allowance must be 0').to.equal(0n);
  });

  it("swapA7A5 BUY: reverts 'insufficient allowance' when USDT allowance is 0", async () => {
    console.log('\n  ── Guard: swapA7A5 BUY zero allowance ──────────────');
    const {facade, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    expect(await facade.allowanceUSDT(traderAddr)).to.equal(0n);
    const msg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
    console.log(`        revert msg: ${msg.slice(0, 80)}`);
    expect(msg).to.contain('InsufficientAllowance');
  });

  it("swapA7A5 BUY: reverts 'insufficient allowance' when USDT allowance is amountIn − 1", async () => {
    console.log('\n  ── Guard: swapA7A5 BUY partial allowance ───────────');
    const {facade, facadeAddr, trader} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();
    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN - 1n);
    const msg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
    console.log(`        allowance = USDT_IN-1 → revert: ${msg.slice(0, 80)}`);
    expect(msg).to.contain('InsufficientAllowance');
  });

  it("swapA7A5 SELL: reverts 'insufficient allowance' when A7A5 allowance is 0 or amountIn − 1", async () => {
    console.log('\n  ── Guard: swapA7A5 SELL zero/partial allowance ─────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {a7a5} = tokens();

    expect(await facade.allowanceA7A5(traderAddr)).to.equal(0n);
    const zeroMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(A7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        zero allowance revert:    ${zeroMsg.slice(0, 80)}`);
    expect(zeroMsg).to.contain('InsufficientAllowance');

    await (a7a5.connect(trader) as any).approve(facadeAddr, A7A5_IN - 1n);
    const partialMsg = await revertMsg(facade.connect(trader).swapA7A5.staticCall(A7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        partial allowance revert: ${partialMsg.slice(0, 80)}`);
    expect(partialMsg).to.contain('InsufficientAllowance');
  });

  it("swapWA7A5 BUY: reverts 'insufficient allowance' when USDT allowance is 0 or amountIn − 1", async () => {
    console.log('\n  ── Guard: swapWA7A5 BUY zero/partial allowance ──────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();

    expect(await facade.allowanceUSDT(traderAddr)).to.equal(0n);
    const zeroMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
    console.log(`        zero allowance revert:    ${zeroMsg.slice(0, 80)}`);
    expect(zeroMsg).to.contain('InsufficientAllowance');

    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN - 1n);
    const partialMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
    console.log(`        partial allowance revert: ${partialMsg.slice(0, 80)}`);
    expect(partialMsg).to.contain('InsufficientAllowance');
  });

  it("swapWA7A5 SELL: reverts 'insufficient allowance' when wA7A5 allowance is 0 or amountIn − 1", async () => {
    console.log('\n  ── Guard: swapWA7A5 SELL zero/partial allowance ─────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {a7a5, wa7a5} = tokens();

    await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, traderAddr, WA7A5_IN * 2n);
    await (a7a5.connect(trader) as any).approve(ADDRESSES.WA7A5, WA7A5_IN * 2n);
    await (wa7a5.connect(trader) as any).wrap(WA7A5_IN);
    const wa7a5Bal: bigint = await wa7a5.balanceOf(traderAddr);
    expect(wa7a5Bal, 'must have wA7A5').to.be.greaterThan(0n);

    expect(await facade.allowanceWA7A5(traderAddr)).to.equal(0n);
    const zeroMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(wa7a5Bal, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        zero allowance revert:    ${zeroMsg.slice(0, 80)}`);
    expect(zeroMsg).to.contain('InsufficientAllowance');

    await (wa7a5.connect(trader) as any).approve(facadeAddr, wa7a5Bal - 1n);
    const partialMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(wa7a5Bal, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        partial allowance revert: ${partialMsg.slice(0, 80)}`);
    expect(partialMsg).to.contain('InsufficientAllowance');
  });

  it('swapA7A5 BUY: exact USDT allowance == amountIn → swap succeeds (guard threshold is >=)', async () => {
    console.log('\n  ── Guard: exact allowance threshold ───────────────────');
    const {facade, facadeAddr, trader, traderAddr} = await loadFixture(deployFacadeFixture);
    const {usdt} = tokens();
    await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, traderAddr, USDT_IN);
    await (usdt.connect(trader) as any).approve(facadeAddr, USDT_IN);
    expect(await facade.allowanceUSDT(traderAddr)).to.equal(USDT_IN);
    const amountOut: bigint = await facade.connect(trader).swapA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE);
    console.log(`        exact allowance (${USDT_IN}) → amountOut = ${amountOut}  ✓`);
    expect(amountOut).to.be.greaterThan(0n);
  });
});
