import {expect} from 'chai';
import {formatUnits} from 'ethers';
import {network} from 'hardhat';

import {ADDRESSES} from '../../common/addresses.js';
import {forkReady, fundFromWhale, formatUnits6} from '../helpers.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';

// ── Fork-network connection ──────────────────────────────────────────────────

const conn = await network.create('hardhat');
const {ethers, networkHelpers} = conn;
const {loadFixture} = networkHelpers;

// ── Constants ─────────────────────────────────────────────────────────────────

const TWAP_WINDOW = 60; // seconds
const MAX_STALENESS = 2 * 24 * 60 * 60; // 2 days
const USDT_POKE = 1_000_000n; // 1 USDT (6 dec)
const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 7200);

const V3_POOL_ABI = ['function increaseObservationCardinalityNext(uint16 observationCardinalityNext)'];

const CHAINLINK_ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'];

const V2_PAIR_ABI = ['function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)', 'function token0() view returns (address)', 'function token1() view returns (address)'];

// ── Fixture ───────────────────────────────────────────────────────────────────

async function deployOracleForkFixture() {
  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  // Deploy PoolsFacade to drive TWAP warmup swaps (same pattern as Paymaster tests).
  const facade = await ethers.deployContract('PoolsFacade', [
    ADDRESSES.WA7A5,
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
    ADDRESSES.V2_PAIR_USDT_A7A5,
    ADDRESSES.SWAP_ROUTER_02,
    ADDRESSES.QUOTER_V2,
    ADDRESSES.V3_FEE_TIER,
  ]);
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();

  // Grow the observation buffer and write 3 observations across 140s > TWAP_WINDOW.
  const pool = new ethers.Contract(ADDRESSES.V3_POOL_USDT_WA7A5, V3_POOL_ABI, deployer);
  await (await pool.increaseObservationCardinalityNext(30)).wait();

  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, deployerAddr, USDT_POKE * 10n);
  const usdt = IA7A5__factory.connect(ADDRESSES.USDT, deployer);
  await (await (usdt as any).approve(facadeAddr, USDT_POKE * 10n)).wait();

  for (let i = 0; i < 3; i++) {
    await networkHelpers.time.increase(45);
    // SIDE.BUY = 0: spend USDT to buy wA7A5, writing a pool observation each block.
    await (await (facade as any).connect(deployer).swapWA7A5(USDT_POKE, 0n, 0n, FAR_DEADLINE)).wait();
  }
  await networkHelpers.time.increase(5);

  // Deploy all three oracles.
  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    ADDRESSES.V3_POOL_USDT_WA7A5,
    ADDRESSES.WA7A5,
    ADDRESSES.USDT,
    TWAP_WINDOW,
    deployerAddr,
  ]);
  await twap.waitForDeployment();
  const twapAddr = await twap.getAddress();

  const nativeOracle = await ethers.deployContract('A7A5NativeOracle', [
    twapAddr,
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    deployerAddr,
  ]);
  await nativeOracle.waitForDeployment();

  const usdtOracle = await ethers.deployContract('UsdtNativeOracle', [
    ADDRESSES.CHAINLINK_USDT_ETH,
    MAX_STALENESS,
    deployerAddr,
  ]);
  await usdtOracle.waitForDeployment();

  // Deploy V2 spot oracle (no warmup needed — reads live reserves).
  const v2Oracle = await ethers.deployContract('A7A5UsdtV2Oracle', [
    ADDRESSES.V2_PAIR_USDT_A7A5,
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
  ]);
  await v2Oracle.waitForDeployment();

  // A7A5NativeOracle backed by V2 spot price; wa7a5 is passed only for a7a5Dec lookup.
  const nativeOracleV2 = await ethers.deployContract('A7A5NativeOracle', [
    await v2Oracle.getAddress(),
    ADDRESSES.CHAINLINK_USDT_ETH,
    ADDRESSES.WA7A5,
    MAX_STALENESS,
    deployerAddr,
  ]);
  await nativeOracleV2.waitForDeployment();

  return {deployer, deployerAddr, twap, nativeOracle, usdtOracle, v2Oracle, nativeOracleV2};
}

// ── ETH price for display ─────────────────────────────────────────────────────

let ethUsd = 3000;
before(async function () {
  try {
    const feed = new ethers.Contract(ADDRESSES.CHAINLINK_USDT_ETH, CHAINLINK_ABI, ethers.provider);
    const [, answer] = await feed.latestRoundData();
    ethUsd = Math.round(1e18 / Number(answer));
  } catch {
    // fork not available; use fallback
  }
  console.log(`\n  ETH price: $${ethUsd}/ETH`);
});

// ── Oracle fork tests ─────────────────────────────────────────────────────────

const run = forkReady(ADDRESSES.V3_POOL_USDT_WA7A5, ADDRESSES.CHAINLINK_USDT_ETH, ADDRESSES.WA7A5);

(run ? describe : describe.skip)('Oracle fork tests', function () {
  this.timeout(180_000);

  // ── A7A5UsdtTwapOracle ──────────────────────────────────────────────────────

  describe('A7A5UsdtTwapOracle (fork)', function () {
    it('latestAnswer() returns a positive price and logs USDT/A7A5', async function () {
      const {twap} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (twap as any).latestAnswer();
      console.log(`\n  A7A5/USDT TWAP: ${formatUnits(answer, 8)} USDT per A7A5`);
      console.log(`  USDT/A7A5 TWAP: ${formatUnits6(100_000_000_000_000n / answer)} A7A5 per USDT`);
      expect(answer).to.be.greaterThan(0n);
    });

    it('latestAnswer() is in a plausible range (0.01–1000 USDT per A7A5)', async function () {
      const {twap} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (twap as any).latestAnswer();
      expect(answer).to.be.greaterThan(1_000_000n); // > 0.01 USDT (8 dec)
      expect(answer).to.be.lessThan(100_000_000_000n); // < 1000 USDT (8 dec)
    });

    it('latestRoundData() answer matches latestAnswer() and timestamps equal block.timestamp', async function () {
      const {twap} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (twap as any).latestAnswer();
      const [roundId, roundAnswer, startedAt, updatedAt, answeredInRound] = await (twap as any).latestRoundData();
      const block = await ethers.provider.getBlock('latest');
      expect(BigInt(roundAnswer)).to.equal(answer);
      expect(BigInt(startedAt)).to.equal(BigInt(block!.timestamp));
      expect(BigInt(updatedAt)).to.equal(BigInt(block!.timestamp));
      expect(roundId).to.equal(answeredInRound);
    });

    it('decimals() returns 8', async function () {
      const {twap} = await loadFixture(deployOracleForkFixture);
      expect(await (twap as any).decimals()).to.equal(8n);
    });

    it('description() and version() return expected values', async function () {
      const {twap} = await loadFixture(deployOracleForkFixture);
      expect(await (twap as any).description()).to.equal('A7A5 / USDT TWAP');
      expect(await (twap as any).version()).to.equal(1n);
    });

    it('latestAnswer() with a 120s window returns a positive price', async function () {
      // 140s of warmup history covers the 120s window (target = T+20, between T and T+45).
      const {deployerAddr} = await loadFixture(deployOracleForkFixture);
      const twap120 = await ethers.deployContract('A7A5UsdtTwapOracle', [
        ADDRESSES.V3_POOL_USDT_WA7A5,
        ADDRESSES.WA7A5,
        ADDRESSES.USDT,
        120,
        deployerAddr,
      ]);
      await twap120.waitForDeployment();
      const answer: bigint = await (twap120 as any).latestAnswer();
      console.log(`\n  A7A5/USDT (120s window): ${formatUnits(answer, 8)} USDT per A7A5`);
      console.log(`  USDT/A7A5 (120s window): ${formatUnits6(100_000_000_000_000n / answer)} A7A5 per USDT`);
      expect(answer).to.be.greaterThan(0n);
    });
  });

  // ── A7A5NativeOracle ────────────────────────────────────────────────────────

  describe('A7A5NativeOracle (fork)', function () {
    it('tokenPriceData() returns positive price + future validUntil and logs all three rates', async function () {
      const {nativeOracle, twap} = await loadFixture(deployOracleForkFixture);

      const feed = new ethers.Contract(ADDRESSES.CHAINLINK_USDT_ETH, CHAINLINK_ABI, ethers.provider);
      const [, ethPerUsdt] = await feed.latestRoundData();
      const usdtPerA7A5: bigint = await (twap as any).latestAnswer();

      const [price, validUntil] = await (nativeOracle as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');

      const usdtPerEth = 1_000_000_000_000_000_000n / BigInt(ethPerUsdt);
      console.log(`\n  USDT/ETH:   ${usdtPerEth} USDT per ETH`);
      console.log(`  A7A5/USDT:  ${formatUnits(usdtPerA7A5, 8)} USDT per A7A5`);
      console.log(`  USDT/A7A5:  ${formatUnits6(100_000_000_000_000n / usdtPerA7A5)} A7A5 per USDT`);
      console.log(`  A7A5/ETH:   ${formatUnits6(price)} A7A5 per ETH`);
      console.log(`  validUntil: ${new Date(Number(validUntil) * 1000).toISOString()}`);

      expect(BigInt(price)).to.be.greaterThan(0n);
      expect(BigInt(validUntil)).to.be.greaterThan(BigInt(block!.timestamp));
    });

    it('math cross-check: price × ethPerUsdt × usdtPerA7A5 ≈ NUMERATOR (≤ with tiny floor error)', async function () {
      const {nativeOracle, twap} = await loadFixture(deployOracleForkFixture);

      const feed = new ethers.Contract(ADDRESSES.CHAINLINK_USDT_ETH, CHAINLINK_ABI, ethers.provider);
      const [, rawEthPerUsdt] = await feed.latestRoundData();
      const ethPerUsdt = BigInt(rawEthPerUsdt);
      const usdtPerA7A5: bigint = await (twap as any).latestAnswer();
      const [price] = await (nativeOracle as any).tokenPriceData();
      const price_ = BigInt(price);
      const NUMERATOR: bigint = await (nativeOracle as any).NUMERATOR();

      const denom = ethPerUsdt * usdtPerA7A5;
      const product = price_ * denom;
      const floorError = NUMERATOR - product;
      const relErrPpm = (floorError * 1_000_000n) / NUMERATOR;

      console.log('\n  ── A7A5NativeOracle math cross-check ──────────────────────');
      console.log(`  NUMERATOR  = 10^(a7a5Dec+feedDec+twapDec) = 10^(6+18+8) = ${NUMERATOR}`);
      console.log(`  ethPerUsdt = ${ethPerUsdt}  (Chainlink USDT/ETH, 18 dec)`);
      console.log(`             → ${formatUnits6(1_000_000_000_000_000_000_000_000n / ethPerUsdt)} USDT per ETH`);
      console.log(`  usdtPerA7A5= ${usdtPerA7A5}  (TWAP, 8 dec)`);
      console.log(`             → ${formatUnits(usdtPerA7A5, 8)} USDT per A7A5`);
      console.log(`  denom      = ethPerUsdt × usdtPerA7A5`);
      console.log(`             = ${ethPerUsdt} × ${usdtPerA7A5}`);
      console.log(`             = ${denom}`);
      console.log(`  price      = NUMERATOR / denom  (integer floor)`);
      console.log(`             = ${NUMERATOR} / ${denom}`);
      console.log(`             = ${price_}  (${formatUnits6(price_)} A7A5 per ETH)`);
      console.log(`  product    = price × denom`);
      console.log(`             = ${price_} × ${denom}`);
      console.log(`             = ${product}`);
      console.log(`  NUMERATOR  = ${NUMERATOR}`);
      console.log(`  floor error= NUMERATOR − product = ${floorError}`);
      console.log(`  relative   = ${relErrPpm} ppm  (expected: < 1 ppm)`);

      // Integer division: price = NUMERATOR / denom (floor), so product ≤ NUMERATOR.
      // Rounding loss is at most denom−1, which is negligible (~4e−11 relative error).
      expect(product).to.be.lte(NUMERATOR);
      expect(product).to.be.gte(NUMERATOR - NUMERATOR / 100n); // within 1% (actual error ~0%)
    });

    it('tokenPrice() equals tokenPriceData().price', async function () {
      const {nativeOracle} = await loadFixture(deployOracleForkFixture);
      const [priceFromData] = await (nativeOracle as any).tokenPriceData();
      const priceFromView = await (nativeOracle as any).tokenPrice();
      expect(BigInt(priceFromView)).to.equal(BigInt(priceFromData));
    });

    it('price is in a plausible range (1–100M A7A5 per ETH)', async function () {
      const {nativeOracle} = await loadFixture(deployOracleForkFixture);
      const [price] = await (nativeOracle as any).tokenPriceData();
      expect(BigInt(price)).to.be.greaterThan(1_000_000n); // > 1 A7A5/ETH (6 dec)
      expect(BigInt(price)).to.be.lessThan(100_000_000_000_000n); // < 100M A7A5/ETH (6 dec)
    });

    it('tokenPriceData() does NOT revert when the Chainlink answer is stale', async function () {
      const {nativeOracle} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      const [price, validUntil] = await (nativeOracle as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');
      expect(BigInt(price)).to.be.greaterThan(0n);
      // validUntil is now in the past
      expect(BigInt(validUntil)).to.be.lessThan(BigInt(block!.timestamp));
    });

    it('tokenPrice() reverts when the quote is stale', async function () {
      const {nativeOracle} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      await expect((nativeOracle as any).tokenPrice()).to.be.revertedWithCustomError(
        nativeOracle,
        'A7A5NativeOracle__StalePrice',
      );
    });
  });

  // ── UsdtNativeOracle ────────────────────────────────────────────────────────

  describe('UsdtNativeOracle (fork)', function () {
    it('tokenPriceData() returns positive price + future validUntil and logs USDT/ETH', async function () {
      const {usdtOracle} = await loadFixture(deployOracleForkFixture);
      const [price, validUntil] = await (usdtOracle as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');

      // price = USDT base units per 1e18 wei ETH; formatUnits6 → human USDT per ETH.
      console.log(`\n  USDT/ETH oracle: ${formatUnits6(price)} USDT per ETH`);
      console.log(`  validUntil:      ${new Date(Number(validUntil) * 1000).toISOString()}`);

      expect(BigInt(price)).to.be.greaterThan(0n);
      expect(BigInt(validUntil)).to.be.greaterThan(BigInt(block!.timestamp));
    });

    it('tokenPrice() equals tokenPriceData().price', async function () {
      const {usdtOracle} = await loadFixture(deployOracleForkFixture);
      const [priceFromData] = await (usdtOracle as any).tokenPriceData();
      const priceFromView = await (usdtOracle as any).tokenPrice();
      expect(BigInt(priceFromView)).to.equal(BigInt(priceFromData));
    });

    it('price is in a plausible range (100–100k USDT per ETH at 6 dec)', async function () {
      const {usdtOracle} = await loadFixture(deployOracleForkFixture);
      const [price] = await (usdtOracle as any).tokenPriceData();
      expect(BigInt(price)).to.be.greaterThan(100_000_000n); // > 100 USDT/ETH
      expect(BigInt(price)).to.be.lessThan(100_000_000_000n); // < 100k USDT/ETH
    });

    it('tokenPriceData() does NOT revert when the Chainlink answer is stale', async function () {
      const {usdtOracle} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      const [price, validUntil] = await (usdtOracle as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');
      expect(BigInt(price)).to.be.greaterThan(0n);
      expect(BigInt(validUntil)).to.be.lessThan(BigInt(block!.timestamp));
    });

    it('tokenPrice() reverts when the quote is stale', async function () {
      const {usdtOracle} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      await expect((usdtOracle as any).tokenPrice()).to.be.revertedWithCustomError(
        usdtOracle,
        'UsdtNativeOracle__StalePrice',
      );
    });
  });

  // ── A7A5UsdtV2Oracle ────────────────────────────────────────────────────────

  describe('A7A5UsdtV2Oracle (fork)', function () {
    it('latestAnswer() returns a positive price and logs V2 spot USDT/A7A5', async function () {
      const {v2Oracle} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (v2Oracle as any).latestAnswer();

      const pair = new ethers.Contract(ADDRESSES.V2_PAIR_USDT_A7A5, V2_PAIR_ABI, ethers.provider);
      const [r0, r1] = await pair.getReserves();
      const token0: string = await pair.token0();
      const [reserveA7A5, reserveUSDT] = token0.toLowerCase() === ADDRESSES.A7A5.toLowerCase()
        ? [BigInt(r0), BigInt(r1)]
        : [BigInt(r1), BigInt(r0)];

      console.log(`\n  V2 reserves:     ${formatUnits(reserveA7A5, 6)} A7A5 | ${formatUnits(reserveUSDT, 6)} USDT`);
      console.log(`  A7A5/USDT V2:    ${formatUnits(answer, 8)} USDT per A7A5`);
      console.log(`  USDT/A7A5 V2:    ${formatUnits6(100_000_000_000_000n / answer)} A7A5 per USDT`);
      expect(answer).to.be.greaterThan(0n);
    });

    it('latestAnswer() is in a plausible range (0.01–1000 USDT per A7A5)', async function () {
      const {v2Oracle} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (v2Oracle as any).latestAnswer();
      expect(answer).to.be.greaterThan(1_000_000n);      // > 0.01 USDT (8 dec)
      expect(answer).to.be.lessThan(100_000_000_000n);   // < 1000 USDT (8 dec)
    });

    it('latestRoundData() answer matches latestAnswer() and timestamps equal block.timestamp', async function () {
      const {v2Oracle} = await loadFixture(deployOracleForkFixture);
      const answer: bigint = await (v2Oracle as any).latestAnswer();
      const [roundId, roundAnswer, startedAt, updatedAt, answeredInRound] = await (v2Oracle as any).latestRoundData();
      const block = await ethers.provider.getBlock('latest');
      expect(BigInt(roundAnswer)).to.equal(answer);
      expect(BigInt(startedAt)).to.equal(BigInt(block!.timestamp));
      expect(BigInt(updatedAt)).to.equal(BigInt(block!.timestamp));
      expect(roundId).to.equal(answeredInRound);
    });

    it('decimals() returns 8, description() and version() return expected values', async function () {
      const {v2Oracle} = await loadFixture(deployOracleForkFixture);
      expect(await (v2Oracle as any).decimals()).to.equal(8n);
      expect(await (v2Oracle as any).description()).to.equal('A7A5 / USDT V2');
      expect(await (v2Oracle as any).version()).to.equal(1n);
    });
  });

  // ── A7A5NativeOracle with V2 feed ───────────────────────────────────────────

  describe('A7A5NativeOracle with V2 feed (fork)', function () {
    it('tokenPriceData() returns positive price + future validUntil and logs all rates', async function () {
      const {v2Oracle, nativeOracleV2} = await loadFixture(deployOracleForkFixture);

      const feed = new ethers.Contract(ADDRESSES.CHAINLINK_USDT_ETH, CHAINLINK_ABI, ethers.provider);
      const [, ethPerUsdt] = await feed.latestRoundData();
      const usdtPerA7A5: bigint = await (v2Oracle as any).latestAnswer();

      const pair = new ethers.Contract(ADDRESSES.V2_PAIR_USDT_A7A5, V2_PAIR_ABI, ethers.provider);
      const [r0, r1] = await pair.getReserves();
      const token0: string = await pair.token0();
      const [reserveA7A5, reserveUSDT] = token0.toLowerCase() === ADDRESSES.A7A5.toLowerCase()
        ? [BigInt(r0), BigInt(r1)]
        : [BigInt(r1), BigInt(r0)];

      const [price, validUntil] = await (nativeOracleV2 as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');

      const usdtPerEth = 1_000_000_000_000_000_000n / BigInt(ethPerUsdt);
      console.log(`\n  V2 reserves:   ${formatUnits(reserveA7A5, 6)} A7A5 | ${formatUnits(reserveUSDT, 6)} USDT`);
      console.log(`  USDT/ETH:      ${usdtPerEth} USDT per ETH`);
      console.log(`  A7A5/USDT V2:  ${formatUnits(usdtPerA7A5, 8)} USDT per A7A5`);
      console.log(`  USDT/A7A5 V2:  ${formatUnits6(100_000_000_000_000n / usdtPerA7A5)} A7A5 per USDT`);
      console.log(`  A7A5/ETH V2:   ${formatUnits6(price)} A7A5 per ETH`);
      console.log(`  validUntil:    ${new Date(Number(validUntil) * 1000).toISOString()}`);

      expect(BigInt(price)).to.be.greaterThan(0n);
      expect(BigInt(validUntil)).to.be.greaterThan(BigInt(block!.timestamp));
    });

    it('math cross-check: price × ethPerUsdt × usdtPerA7A5 ≈ NUMERATOR (V2 feed)', async function () {
      const {v2Oracle, nativeOracleV2} = await loadFixture(deployOracleForkFixture);

      const feed = new ethers.Contract(ADDRESSES.CHAINLINK_USDT_ETH, CHAINLINK_ABI, ethers.provider);
      const [, rawEthPerUsdt] = await feed.latestRoundData();
      const ethPerUsdt = BigInt(rawEthPerUsdt);
      const usdtPerA7A5: bigint = await (v2Oracle as any).latestAnswer();
      const [price] = await (nativeOracleV2 as any).tokenPriceData();
      const price_ = BigInt(price);
      const NUMERATOR: bigint = await (nativeOracleV2 as any).NUMERATOR();

      const denom = ethPerUsdt * usdtPerA7A5;
      const product = price_ * denom;
      const floorError = NUMERATOR - product;
      const relErrPpm = (floorError * 1_000_000n) / NUMERATOR;

      console.log('\n  ── A7A5NativeOracle (V2 feed) math cross-check ───────────');
      console.log(`  NUMERATOR   = 10^(a7a5Dec+feedDec+twapDec) = 10^(6+18+8) = ${NUMERATOR}`);
      console.log(`  ethPerUsdt  = ${ethPerUsdt}  (Chainlink USDT/ETH, 18 dec)`);
      console.log(`              → ${formatUnits6(1_000_000_000_000_000_000_000_000n / ethPerUsdt)} USDT per ETH`);
      console.log(`  usdtPerA7A5 = ${usdtPerA7A5}  (V2 spot, 8 dec)`);
      console.log(`              → ${formatUnits(usdtPerA7A5, 8)} USDT per A7A5`);
      console.log(`  denom       = ethPerUsdt × usdtPerA7A5 = ${denom}`);
      console.log(`  price       = NUMERATOR / denom = ${price_}  (${formatUnits6(price_)} A7A5 per ETH)`);
      console.log(`  product     = price × denom = ${product}`);
      console.log(`  floor error = NUMERATOR − product = ${floorError}`);
      console.log(`  relative    = ${relErrPpm} ppm  (expected: < 1 ppm)`);

      expect(product).to.be.lte(NUMERATOR);
      expect(product).to.be.gte(NUMERATOR - NUMERATOR / 100n); // within 1%
    });

    it('tokenPrice() equals tokenPriceData().price', async function () {
      const {nativeOracleV2} = await loadFixture(deployOracleForkFixture);
      const [priceFromData] = await (nativeOracleV2 as any).tokenPriceData();
      const priceFromView = await (nativeOracleV2 as any).tokenPrice();
      expect(BigInt(priceFromView)).to.equal(BigInt(priceFromData));
    });

    it('price is in a plausible range (1–100M A7A5 per ETH)', async function () {
      const {nativeOracleV2} = await loadFixture(deployOracleForkFixture);
      const [price] = await (nativeOracleV2 as any).tokenPriceData();
      expect(BigInt(price)).to.be.greaterThan(1_000_000n);          // > 1 A7A5/ETH (6 dec)
      expect(BigInt(price)).to.be.lessThan(100_000_000_000_000n);   // < 100M A7A5/ETH (6 dec)
    });

    it('tokenPriceData() does NOT revert when the Chainlink answer is stale', async function () {
      const {nativeOracleV2} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      const [price, validUntil] = await (nativeOracleV2 as any).tokenPriceData();
      const block = await ethers.provider.getBlock('latest');
      expect(BigInt(price)).to.be.greaterThan(0n);
      expect(BigInt(validUntil)).to.be.lessThan(BigInt(block!.timestamp));
    });

    it('tokenPrice() reverts when the quote is stale', async function () {
      const {nativeOracleV2} = await loadFixture(deployOracleForkFixture);
      await networkHelpers.time.increase(MAX_STALENESS + 3600);
      await expect((nativeOracleV2 as any).tokenPrice()).to.be.revertedWithCustomError(
        nativeOracleV2,
        'A7A5NativeOracle__StalePrice',
      );
    });
  });

  // ── V3 TWAP vs V2 spot price comparison ────────────────────────────────────

  describe('V3 TWAP (wA7A5 pool) vs V2 spot (A7A5 pool) comparison', function () {
    it('both oracles return positive prices and agree within 50%', async function () {
      const {twap, v2Oracle, deployerAddr} = await loadFixture(deployOracleForkFixture);

      const v3Answer: bigint = await (twap as any).latestAnswer();
      const v2Answer: bigint = await (v2Oracle as any).latestAnswer();

      const larger = v3Answer > v2Answer ? v3Answer : v2Answer;
      const smaller = v3Answer > v2Answer ? v2Answer : v3Answer;
      const diffBps = ((larger - smaller) * 10_000n) / larger;

      console.log(`\n  ── V3 TWAP vs V2 spot ───────────────────────────────────`);
      console.log(`  V3 TWAP (wA7A5/USDT): ${formatUnits(v3Answer, 8)} USDT per A7A5`);
      console.log(`  V2 spot (A7A5/USDT):  ${formatUnits(v2Answer, 8)} USDT per A7A5`);
      console.log(`  Spread:               ${Number(diffBps) / 100} %`);
      console.log(`  Deployer used:        ${deployerAddr}`);

      expect(v3Answer).to.be.greaterThan(0n);
      expect(v2Answer).to.be.greaterThan(0n);
      // Loose bound: prices from two independent sources should be within 50%.
      expect(larger - smaller).to.be.lte(larger / 2n);
    });
  });
});
