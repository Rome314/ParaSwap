import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/types';
import type { IA7A5, IWA7A5, PoolsFacade } from '../../types/ethers-contracts/index.js';
import {ethers, FAR_DEADLINE, loadFixture, networkHelpers, PAST_DEADLINE, SIDE, USDT_IN, WA7A5_IN} from './consts.js';
import {buyFixture, deployFacadeFixture, v3SellFixture} from './fixtures.js';
import {abs, formatUnits6, gasUsedEthStr, revertMsg, tokens} from './helpers.js';
import {expect} from 'chai';

// ── swapWA7A5 ────────────────────────────────────────────────────────────
describe('swapWA7A5', function () {

  let facade: PoolsFacade;
  let facadeAddr: string;
  let trader: HardhatEthersSigner;
  let traderAddr: string;

  let usdt: IA7A5;
  let wa7a5: IWA7A5;


  let usdtBefore: bigint;
  let wa7a5Before: bigint;
  
  describe("BUY", function (){
    const side = SIDE.BUY;

    beforeEach(async function () {
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(buyFixture));
      ({usdt, wa7a5} = tokens());
      usdtBefore = await usdt.balanceOf(traderAddr);
      wa7a5Before = await wa7a5.balanceOf(traderAddr);
    });



    it('swapWA7A5 BUY: trader receives wA7A5 and spends exactly USDT_IN', async () => {
      console.log('\n  ── swapWA7A5 BUY — basic ────────────────────────────');
      
      const wa7a5Expected = await facade.quoteWA7A5PerUSDT.staticCall(USDT_IN,side);
      
      const receipt = await (await facade.connect(trader).swapWA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const wa7a5Gained: bigint = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;
      const usdtSpent: bigint = usdtBefore - (await usdt.balanceOf(traderAddr));
      
      console.log(`        amountIn      ${formatUnits6(USDT_IN)} USDT`);
      console.log(`        wA7A5 expected  ${formatUnits6(wa7a5Expected)} wA7A5`);
      console.log(`        wA7A5 gained  ${formatUnits6(wa7a5Gained)} wA7A5`);
      console.log(`        USDT spent    ${formatUnits6(usdtSpent)} USDT`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);
      
      expect(wa7a5Gained, 'trader must receive wA7A5').to.be.equal(wa7a5Expected);
      expect(usdtSpent, 'trader must spend exactly USDT_IN').to.equal(USDT_IN);
      
      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await wa7a5.balanceOf(facadeAddr), 'facade must hold no wA7A5').to.equal(0n);
    });
  
    it('swapWA7A5 BUY: wA7A5 received is close to quoteWA7A5PerUSDT (same pool, small impact)', async () => {
      console.log('\n  ── swapWA7A5 BUY — vs quote ─────────────────────────');
      const wa7a5Expected: bigint = await facade.quoteWA7A5PerUSDT.staticCall(USDT_IN, side);

      await (await facade.connect(trader).swapWA7A5(USDT_IN, side, 0n, FAR_DEADLINE)).wait();
      const usdtSpent:bigint = usdtBefore - (await usdt.balanceOf(traderAddr))
      const wa7a5Gained: bigint = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;
      const absDiff = abs(wa7a5Gained, wa7a5Expected)

      console.log(`        expected        ${formatUnits6(wa7a5Expected)} wA7A5`);
      console.log(`        gained        ${formatUnits6(wa7a5Gained)} wA7A5`);
      console.log(`        spent        ${formatUnits6(usdtSpent)} USDT`);
      console.log(`        absDiff       ${absDiff}`);

      expect(usdtSpent).to.be.equal(USDT_IN)
      expect(wa7a5Gained, 'wA7A5 gained must be positive').to.be.greaterThan(0n);
      expect(absDiff, 'swap result must match quote within 1 unit').to.be.lessThanOrEqual(1n);
    });
    
    it('swapWA7A5 BUY: reverts when amountOutMin exceeds achievable wA7A5 output', async () => {
      console.log('\n  ── swapWA7A5 BUY — amountOutMin too high ────────────');
      const msg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(USDT_IN, side, ethers.MaxUint256, FAR_DEADLINE));
      console.log(`        revert msg: ${msg.slice(0, 80)}`);
      expect(msg.length, 'must revert with non-empty message').to.be.greaterThan(0);
    });
  
    it('swapWA7A5 BUY: succeeds when amountOutMin is ≤ actual wA7A5 output', async () => {
      console.log('\n  ── swapWA7A5 BUY — sane amountOutMin ────────────────');
      const wa7a5Expected: bigint = await facade.quoteWA7A5PerUSDT.staticCall(USDT_IN, side);
      const saneMin: bigint = (wa7a5Expected * 90n) / 100n;

      const receipt = await (await facade.connect(trader).swapWA7A5(USDT_IN, side, saneMin, FAR_DEADLINE)).wait();
      const wa7a5Gained: bigint = (await wa7a5.balanceOf(traderAddr)) - wa7a5Before;

      console.log(`        expected        ${formatUnits6(wa7a5Expected)} wA7A5`);
      console.log(`        saneMin       ${formatUnits6(saneMin)} wA7A5`);
      console.log(`        wa7a5Gained   ${formatUnits6(wa7a5Gained)} wA7A5`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);

      expect(wa7a5Gained, 'wA7A5 gained must be positive').to.be.greaterThan(0n);
      expect(wa7a5Gained, ).to.be.equal(wa7a5Expected);
      expect(wa7a5Gained, 'gained must be ≥ saneMin').to.be.greaterThanOrEqual(saneMin);
    });
  })

  describe("SELL",function(){
    const side = SIDE.SELL;
    let TO_SELL:bigint; 
    beforeEach(async function () {
      ({facade, facadeAddr, trader, traderAddr} = await loadFixture(v3SellFixture));
      ({usdt, wa7a5} = tokens());
      usdtBefore = await usdt.balanceOf(traderAddr);
      wa7a5Before = await wa7a5.balanceOf(traderAddr);

      TO_SELL = wa7a5Before / 2n
      await (wa7a5.connect(trader) as any).approve(facadeAddr, TO_SELL);
    });

    it('swapWA7A5 SELL: trader receives USDT and spends exactly approved value', async () => {
      console.log('\n  ── swapWA7A5 SELL — basic ───────────────────────────');

      const usdtExpected = await facade.quoteWA7A5PerUSDT.staticCall(TO_SELL,side)
      const receipt = await (await facade.connect(trader).swapWA7A5(TO_SELL,side, 0n, FAR_DEADLINE)).wait();

      const usdtGained: bigint = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const wa7a5Spent: bigint = wa7a5Before - (await wa7a5.balanceOf(traderAddr));

      console.log(`        wA7A5 in      ${formatUnits6(TO_SELL)} wA7A5`);
      console.log(`        USDT gained   ${formatUnits6(usdtGained)} USDT`);
      console.log(`        USDT expected   ${formatUnits6(usdtExpected)} USDT`);
      console.log(`        wA7A5 spent   ${formatUnits6(wa7a5Spent)} wA7A5`);
      console.log(`        gas used      ${gasUsedEthStr(receipt)} ETH`);

      expect(usdtGained, 'trader must receive USDT').to.be.equal(usdtExpected);
      expect(wa7a5Spent, 'trader must spend exactly TO_SELL').to.equal(TO_SELL);
      
      expect(await usdt.balanceOf(facadeAddr), 'facade must hold no USDT').to.equal(0n);
      expect(await wa7a5.balanceOf(facadeAddr), 'facade must hold no wA7A5').to.equal(0n);
    });
  
    it('swapWA7A5 SELL: USDT received is close to quoteWA7A5PerUSDT (same pool)', async () => {
      console.log('\n  ── swapWA7A5 SELL — vs quote ────────────────────────');
      const usdtExpected: bigint = await facade.quoteWA7A5PerUSDT.staticCall(TO_SELL,side);

      await (await facade.connect(trader).swapWA7A5(TO_SELL, side, 0n, FAR_DEADLINE)).wait();

      const usdtGained: bigint = (await usdt.balanceOf(traderAddr)) - usdtBefore;
      const wa7a5Spent: bigint = wa7a5Before - (await wa7a5.balanceOf(traderAddr));
      const absDiff = abs(usdtGained, usdtExpected)

      console.log(`        expected        ${formatUnits6(usdtExpected)} USDT`);
      console.log(`        gained        ${formatUnits6(usdtGained)} USDT`);
      console.log(`        spent   ${formatUnits6(wa7a5Spent)} wA7A5`);
      console.log(`        absDiff       ${absDiff}`);
      
      expect(usdtGained, 'USDT gained must be equal to expected').to.be.equal(usdtExpected);
      expect(absDiff, 'swap result must match quote within 1 unit').to.be.lessThanOrEqual(1n);
    });

    
  })


  

  

  it("swapWA7A5: reverts 'zero amountIn' when called with amountIn == 0", async () => {
    console.log('\n  ── swapWA7A5 — zero amountIn ────────────────────────');
    const {facade, trader} = await loadFixture(deployFacadeFixture);
    const buyMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(0n, SIDE.BUY, 0n, FAR_DEADLINE));
    const sellMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(0n, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
    console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
    expect(buyMsg).to.contain('zero amountIn');
    expect(sellMsg).to.contain('zero amountIn');
  });

  it("swapWA7A5: reverts 'expired' when deadline is in the past", async () => {
    console.log('\n  ── swapWA7A5 — expired deadline ─────────────────────');
    const {facade, trader} = await loadFixture(deployFacadeFixture);
    const buyMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, PAST_DEADLINE));
    const sellMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(WA7A5_IN, SIDE.SELL, 0n, PAST_DEADLINE));
    console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
    console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
    expect(buyMsg).to.contain('expired');
    expect(sellMsg).to.contain('expired');
  });

  

  it("swapWA7A5: reverts 'insufficient allowance' when caller has no token approval", async () => {
    console.log('\n  ── swapWA7A5 — no approval ──────────────────────────');
    const {facade, trader} = await loadFixture(deployFacadeFixture);
    const buyMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(USDT_IN, SIDE.BUY, 0n, FAR_DEADLINE));
    const sellMsg = await revertMsg(facade.connect(trader).swapWA7A5.staticCall(WA7A5_IN, SIDE.SELL, 0n, FAR_DEADLINE));
    console.log(`        BUY revert msg:  ${buyMsg.slice(0, 80)}`);
    console.log(`        SELL revert msg: ${sellMsg.slice(0, 80)}`);
    expect(buyMsg).to.contain('insufficient allowance');
    expect(sellMsg).to.contain('insufficient allowance');
  });
});
