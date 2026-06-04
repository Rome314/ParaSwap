// ── QUOTES (standalone, no swap executed) ─────────────────────────────────

import {expect} from 'chai';
import {ADDRESSES} from '../../common/addresses.js';
import {A7A5_IN, loadFixture, NO_FEE, USDC_IN, USDT_IN, V3_FEE_USDC, V3_FEE_WA7A5, V3_FEE_WETH, WETH_IN} from './consts.js';
import {
  buyA7A5Fixture,
  buyA7A5WithUSDCFixture,
  buyA7A5WithWETHFixture,
  buyWA7A5Fixture,
  buyWA7A5WithUSDCFixture,
  buyWA7A5WithWETHFixture,
  genericV3Fixture,
  sellA7A5Fixture,
  sellA7A5ForUSDCFixture,
  sellA7A5ForWETHFixture,
  sellWA7A5Fixture,
  sellWA7A5ForUSDCFixture,
  sellWA7A5ForWETHFixture,
} from './fixtures.js';
import {fmt18, fmt6} from './helpers.js';

describe('QUOTES', function () {
  before(() => console.log('\n  ── QUOTES ───────────────────────────────────────────'));

  it('A7A5 → USDT returns > 0', async function () {
    const {paraSwap} = await loadFixture(sellA7A5Fixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDT, A7A5_IN, NO_FEE);
    expect(q).to.be.greaterThan(0n);
    console.log(`    A7A5 → USDT   ${fmt6(q)}`);
  });

  it('USDT → A7A5 returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyA7A5Fixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.USDT, ADDRESSES.A7A5, USDT_IN, NO_FEE);
    expect(q).to.be.greaterThan(0n);
    console.log(`    USDT → A7A5   ${fmt6(q)}`);
  });

  it('wA7A5 → USDT returns > 0', async function () {
    const {paraSwap, wa7a5Balance} = (await loadFixture(sellWA7A5Fixture)) as any;
    const q = await paraSwap.quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDT, wa7a5Balance, V3_FEE_WA7A5);
    expect(q).to.be.greaterThan(0n);
    console.log(`    wA7A5 → USDT  ${fmt6(q)}`);
  });

  it('USDT → wA7A5 returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyWA7A5Fixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.USDT, ADDRESSES.WA7A5, USDT_IN, V3_FEE_WA7A5);
    expect(q).to.be.greaterThan(0n);
    console.log(`    USDT → wA7A5  ${fmt6(q)}`);
  });

  it('USDC → USDT (generic V3) returns > 0', async function () {
    const {paraSwap} = await loadFixture(genericV3Fixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.USDC, ADDRESSES.USDT, USDC_IN, V3_FEE_USDC);
    expect(q).to.be.greaterThan(0n);
    console.log(`    USDC → USDT   ${fmt6(q)}`);
  });

  it('A7A5 → USDC (two-hop sell) returns > 0', async function () {
    const {paraSwap} = await loadFixture(sellA7A5ForUSDCFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.A7A5, ADDRESSES.USDC, A7A5_IN, V3_FEE_USDC);
    expect(q).to.be.greaterThan(0n);
    console.log(`    A7A5 → USDC   ${fmt6(q)}`);
  });

  it('USDC → A7A5 (two-hop buy) returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyA7A5WithUSDCFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.USDC, ADDRESSES.A7A5, USDC_IN, V3_FEE_USDC);
    expect(q).to.be.greaterThan(0n);
    console.log(`    USDC → A7A5   ${fmt6(q)}`);
  });

  it('wA7A5 → USDC (two-hop sell) returns > 0', async function () {
    const {paraSwap, wa7a5Balance} = (await loadFixture(sellWA7A5ForUSDCFixture)) as any;
    const q = await paraSwap.quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.USDC, wa7a5Balance, V3_FEE_USDC);
    expect(q).to.be.greaterThan(0n);
    console.log(`    wA7A5 → USDC  ${fmt6(q)}`);
  });

  it('USDC → wA7A5 (two-hop buy) returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyWA7A5WithUSDCFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.USDC, ADDRESSES.WA7A5, USDC_IN, V3_FEE_USDC);
    expect(q).to.be.greaterThan(0n);
    console.log(`    USDC → wA7A5  ${fmt6(q)}`);
  });

  it('A7A5 → WETH (two-hop sell) returns > 0', async function () {
    const {paraSwap} = await loadFixture(sellA7A5ForWETHFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.A7A5, ADDRESSES.WETH, A7A5_IN, V3_FEE_WETH);
    expect(q).to.be.greaterThan(0n);
    console.log(`    A7A5 → WETH   ${fmt18(q)}`);
  });

  it('WETH → A7A5 (two-hop buy) returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyA7A5WithWETHFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.WETH, ADDRESSES.A7A5, WETH_IN, V3_FEE_WETH);
    expect(q).to.be.greaterThan(0n);
    console.log(`    WETH → A7A5   ${fmt6(q)}`);
  });

  it('wA7A5 → WETH (two-hop sell) returns > 0', async function () {
    const {paraSwap, wa7a5Balance} = (await loadFixture(sellWA7A5ForWETHFixture)) as any;
    const q = await paraSwap.quote.staticCall(ADDRESSES.WA7A5, ADDRESSES.WETH, wa7a5Balance, V3_FEE_WETH);
    expect(q).to.be.greaterThan(0n);
    console.log(`    wA7A5 → WETH  ${fmt18(q)}`);
  });

  it('WETH → wA7A5 (two-hop buy) returns > 0', async function () {
    const {paraSwap} = await loadFixture(buyWA7A5WithWETHFixture);
    const q = await paraSwap.quote.staticCall(ADDRESSES.WETH, ADDRESSES.WA7A5, WETH_IN, V3_FEE_WETH);
    expect(q).to.be.greaterThan(0n);
    console.log(`    WETH → wA7A5  ${fmt6(q)}`);
  });
});
