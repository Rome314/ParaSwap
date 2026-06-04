import {expect} from 'chai';
import {network} from 'hardhat';

const conn = await network.create('hardhat');
const {ethers} = conn;

// ── shared constants ──────────────────────────────────────────────────────────

const DECIMALS_6 = 6;
const DECIMALS_8 = 8;
const DECIMALS_18 = 18;
const MIN_MAX_STALENESS = 5 * 60; // 5 minutes in seconds
const MIN_TWAP_WINDOW = 60; // seconds

// ── factory helpers ───────────────────────────────────────────────────────────

/** Deploy two MockChainlinkFeed + MockWA7A5 + MockToken and then A7A5NativeOracle. */
async function deployNativeOracle(overrides: {
  ethPerUsdt?: bigint;
  usdtPerA7A5?: bigint;
  ethFeedUpdatedAt?: number;
  maxStaleness?: number;
} = {}) {
  const [deployer] = await ethers.getSigners();

  const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await a7a5Token.waitForDeployment();

  const wa7a5 = await ethers.deployContract('MockWA7A5', [
    await a7a5Token.getAddress(),
    BigInt(10 ** DECIMALS_6),
    DECIMALS_6,
  ]);
  await wa7a5.waitForDeployment();

  const now = (await ethers.provider.getBlock('latest'))!.timestamp;

  const usdtEthFeed = await ethers.deployContract('MockChainlinkFeed', [
    overrides.ethPerUsdt ?? 400_000_000_000_000n, // ~1/2500 ETH per USDT (18 dec)
    overrides.ethFeedUpdatedAt ?? now,
    DECIMALS_18,
  ]);
  await usdtEthFeed.waitForDeployment();

  const a7a5UsdtFeed = await ethers.deployContract('MockChainlinkFeed', [
    overrides.usdtPerA7A5 ?? 10_000_000n, // 0.1 USDT per A7A5 (8 dec) -> 1e7
    now,
    DECIMALS_8,
  ]);
  await a7a5UsdtFeed.waitForDeployment();

  const oracle = await ethers.deployContract('A7A5NativeOracle', [
    await a7a5UsdtFeed.getAddress(),
    await usdtEthFeed.getAddress(),
    await wa7a5.getAddress(),
    overrides.maxStaleness ?? 2 * 24 * 3600,
    await deployer.getAddress(),
  ]);
  await oracle.waitForDeployment();

  return {deployer, a7a5Token, wa7a5, usdtEthFeed, a7a5UsdtFeed, oracle};
}

/**
 * Deploy a full A7A5UsdtTwapOracle with mock pool + mock tokens.
 * `tickCumulatives` = [older, newer] so delta = newer - older.
 */
async function deployTwapOracle(overrides: {
  tickCumulatives?: [bigint, bigint];
  wa7a5Ratio?: bigint;
  window?: number;
  token0IsWA7A5?: boolean;
} = {}) {
  const [deployer] = await ethers.getSigners();

  const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await a7a5Token.waitForDeployment();
  const a7a5Addr = await a7a5Token.getAddress();

  const wa7a5 = await ethers.deployContract('MockWA7A5', [
    a7a5Addr,
    overrides.wa7a5Ratio ?? BigInt(10 ** DECIMALS_6),
    DECIMALS_6,
  ]);
  await wa7a5.waitForDeployment();
  const wa7a5Addr = await wa7a5.getAddress();

  const usdt = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();

  // Token ordering: wa7a5 and usdt sort by address.
  const t0IsWA7A5 = overrides.token0IsWA7A5 ?? (wa7a5Addr.toLowerCase() < usdtAddr.toLowerCase());
  const pool = await ethers.deployContract('MockPool', [
    t0IsWA7A5 ? wa7a5Addr : usdtAddr,
    t0IsWA7A5 ? usdtAddr : wa7a5Addr,
  ]);
  await pool.waitForDeployment();

  const window = overrides.window ?? MIN_TWAP_WINDOW;

  if (overrides.tickCumulatives) {
    const [older, newer] = overrides.tickCumulatives;
    await (pool as any).setCumulatives(older, newer);
  }

  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [
    await pool.getAddress(),
    wa7a5Addr,
    usdtAddr,
    window,
    await deployer.getAddress(),
  ]);
  await twap.waitForDeployment();

  return {deployer, a7a5Token, wa7a5, usdt, pool, twap, wa7a5Addr, usdtAddr};
}

// ═══════════════════════════════════════════════════════════════════════════════
// A7A5NativeOracle
// ═══════════════════════════════════════════════════════════════════════════════

describe('A7A5NativeOracle (unit)', function () {
  // Line 65: constructor revert when maxStaleness < MIN_MAX_STALENESS
  it('constructor reverts when maxStaleness < 5 minutes', async function () {
    const [deployer] = await ethers.getSigners();

    const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
    await a7a5Token.waitForDeployment();
    const wa7a5 = await ethers.deployContract('MockWA7A5', [await a7a5Token.getAddress(), 1n, DECIMALS_6]);
    await wa7a5.waitForDeployment();
    const feed = await ethers.deployContract('MockChainlinkFeed', [1n, 0n, DECIMALS_18]);
    await feed.waitForDeployment();
    const feedAddr = await feed.getAddress();

    await expect(
      ethers.deployContract('A7A5NativeOracle', [
        feedAddr,
        feedAddr,
        await wa7a5.getAddress(),
        MIN_MAX_STALENESS - 1, // too short
        await deployer.getAddress(),
      ]),
    ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('A7A5NativeOracle')).interface} as any, 'A7A5NativeOracle__StalenessTooLow');
  });

  // Lines 83-86: setMaxStaleness happy path + event
  it('setMaxStaleness updates the staleness window and emits an event', async function () {
    const {oracle} = await deployNativeOracle();
    const newStaleness = 3 * 24 * 3600; // 3 days
    await expect((oracle as any).setMaxStaleness(newStaleness))
      .to.emit(oracle, 'MaxStalenessUpdated')
      .withArgs(2 * 24 * 3600, newStaleness);
    expect(await (oracle as any).maxStaleness()).to.equal(newStaleness);
  });

  // setMaxStaleness reverts below minimum
  it('setMaxStaleness reverts when new value is below MIN_MAX_STALENESS', async function () {
    const {oracle} = await deployNativeOracle();
    await expect((oracle as any).setMaxStaleness(MIN_MAX_STALENESS - 1)).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__StalenessTooLow',
    );
  });

  // Line 98: tokenPriceData reverts when ethPerUsdt feed returns zero/negative
  it('tokenPriceData reverts when the ETH/USDT feed answer is zero', async function () {
    const {oracle, usdtEthFeed} = await deployNativeOracle();
    await (usdtEthFeed as any).setAnswer(0n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__InvalidPrice',
    );
  });

  it('tokenPriceData reverts when the ETH/USDT feed answer is negative', async function () {
    const {oracle, usdtEthFeed} = await deployNativeOracle();
    await (usdtEthFeed as any).setAnswer(-1n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__InvalidPrice',
    );
  });

  // Line 101: tokenPriceData reverts when A7A5/USDT feed returns zero/negative
  it('tokenPriceData reverts when the A7A5/USDT feed answer is zero', async function () {
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(0n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__InvalidPrice',
    );
  });

  it('tokenPriceData reverts when the A7A5/USDT feed answer is negative', async function () {
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(-1n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__InvalidPrice',
    );
  });

  // Line 105: tokenPriceData reverts when computed price rounds down to zero
  it('tokenPriceData reverts when the computed price is zero (denominator too large)', async function () {
    // Make usdtPerA7A5 astronomically large so NUMERATOR / denominator = 0.
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(BigInt(10 ** 30)); // enormous denominator
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(
      oracle,
      'A7A5NativeOracle__InvalidPrice',
    );
  });

  // Sanity: tokenPriceData returns positive values with valid feeds
  it('tokenPriceData returns a positive price and a future validUntil', async function () {
    const {oracle} = await deployNativeOracle();
    const [price, validUntil] = await (oracle as any).tokenPriceData();
    expect(price).to.be.greaterThan(0n);
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    expect(BigInt(validUntil)).to.be.greaterThan(now);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A7A5UsdtTwapOracle
// ═══════════════════════════════════════════════════════════════════════════════

describe('A7A5UsdtTwapOracle (unit)', function () {
  // Line 73: constructor reverts on pool mismatch
  it('constructor reverts when pool tokens do not match wa7a5/usdt', async function () {
    const [deployer] = await ethers.getSigners();
    const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
    await a7a5Token.waitForDeployment();
    const wa7a5 = await ethers.deployContract('MockWA7A5', [await a7a5Token.getAddress(), 1n, DECIMALS_6]);
    await wa7a5.waitForDeployment();
    const usdt = await ethers.deployContract('MockToken', [DECIMALS_6]);
    await usdt.waitForDeployment();

    // Pool has two unrelated addresses (neither is wa7a5 nor usdt).
    const rnd1 = ethers.Wallet.createRandom().address;
    const rnd2 = ethers.Wallet.createRandom().address;
    const pool = await ethers.deployContract('MockPool', [rnd1, rnd2]);
    await pool.waitForDeployment();

    await expect(
      ethers.deployContract('A7A5UsdtTwapOracle', [
        await pool.getAddress(),
        await wa7a5.getAddress(),
        await usdt.getAddress(),
        MIN_TWAP_WINDOW,
        await deployer.getAddress(),
      ]),
    ).to.be.revertedWithCustomError(
      {interface: (await ethers.getContractFactory('A7A5UsdtTwapOracle')).interface} as any,
      'A7A5UsdtTwapOracle__PoolMismatch',
    );
  });

  // Line 75: constructor reverts when window < MIN_TWAP_WINDOW
  it('constructor reverts when twap window is below the minimum', async function () {
    const [deployer] = await ethers.getSigners();
    const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
    await a7a5Token.waitForDeployment();
    const wa7a5 = await ethers.deployContract('MockWA7A5', [await a7a5Token.getAddress(), 1n, DECIMALS_6]);
    await wa7a5.waitForDeployment();
    const wa7a5Addr = await wa7a5.getAddress();
    const usdt = await ethers.deployContract('MockToken', [DECIMALS_6]);
    await usdt.waitForDeployment();
    const usdtAddr = await usdt.getAddress();
    const t0IsWA7A5 = wa7a5Addr.toLowerCase() < usdtAddr.toLowerCase();
    const pool = await ethers.deployContract('MockPool', [
      t0IsWA7A5 ? wa7a5Addr : usdtAddr,
      t0IsWA7A5 ? usdtAddr : wa7a5Addr,
    ]);
    await pool.waitForDeployment();

    await expect(
      ethers.deployContract('A7A5UsdtTwapOracle', [
        await pool.getAddress(),
        wa7a5Addr,
        usdtAddr,
        MIN_TWAP_WINDOW - 1, // too short
        await deployer.getAddress(),
      ]),
    ).to.be.revertedWithCustomError(
      {interface: (await ethers.getContractFactory('A7A5UsdtTwapOracle')).interface} as any,
      'A7A5UsdtTwapOracle__WindowTooShort',
    );
  });

  // Line 125: description()
  it('description returns the expected string', async function () {
    // Tick = +60 over 60 s → meanTick = 1 (positive, low tick → else branch NOT taken)
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    expect(await (twap as any).description()).to.equal('A7A5 / USDT TWAP');
  });

  // Line 129: version()
  it('version returns 1', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    expect(await (twap as any).version()).to.equal(1n);
  });

  // Line 136: getRoundData reverts
  it('getRoundData reverts with NoHistoricalData', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    await expect((twap as any).getRoundData(1n)).to.be.revertedWithCustomError(
      twap,
      'A7A5UsdtTwapOracle__NoHistoricalData',
    );
  });

  // Lines 90-93: setTwapWindow happy path + event
  it('setTwapWindow updates the window and emits TwapWindowUpdated', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    const newWindow = 300;
    await expect((twap as any).setTwapWindow(newWindow))
      .to.emit(twap, 'TwapWindowUpdated')
      .withArgs(MIN_TWAP_WINDOW, newWindow);
    expect(await (twap as any).twapWindow()).to.equal(newWindow);
  });

  it('setTwapWindow reverts when new window is below the minimum', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    await expect((twap as any).setTwapWindow(MIN_TWAP_WINDOW - 1)).to.be.revertedWithCustomError(
      twap,
      'A7A5UsdtTwapOracle__WindowTooShort',
    );
  });

  // Line 107: latestAnswer reverts when getA7A5BywA7A5 returns 0
  it('latestAnswer reverts when the wA7A5 ratio is zero', async function () {
    const {twap} = await deployTwapOracle({
      tickCumulatives: [0n, 60n],
      wa7a5Ratio: 0n,
    });
    await expect((twap as any).latestAnswer()).to.be.revertedWithCustomError(
      twap,
      'A7A5UsdtTwapOracle__InvalidRatio',
    );
  });

  // Line 159: negative tick rounding (delta < 0 && delta % window != 0 → meanTick--)
  // delta = -61, window = 60 → -61 / 60 = -1 (truncated toward zero), but -61 % 60 = -1 ≠ 0
  // so the correction applies: meanTick = -2 (floor toward -∞)
  it('latestAnswer handles negative non-divisible tick delta (floor rounding)', async function () {
    // cumulatives[0]=61 (older), cumulatives[1]=0 (newer) → delta = 0 - 61 = -61
    const {twap} = await deployTwapOracle({tickCumulatives: [61n, 0n]});
    // Should return a positive price without reverting (tick ≈ -2 is valid).
    const price = await (twap as any).latestAnswer();
    expect(price).to.be.greaterThan(0n);
  });

  // Lines 177-180: _getQuoteAtTick else branch (sqrtRatioX96 > uint128.max)
  // tick = 500000 → sqrtRatioX96 >> uint128.max; delta = 500000 * 60 = 30_000_000
  it('latestAnswer covers the high-ratio else branch (tick > 443637)', async function () {
    const WINDOW = MIN_TWAP_WINDOW;
    const HIGH_TICK = 500_000n;
    // delta = HIGH_TICK * window = 500000 * 60 = 30_000_000
    const delta = HIGH_TICK * BigInt(WINDOW);
    // cumulatives[0]=0 (older), cumulatives[1]=delta (newer)
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, delta]});
    const price = await (twap as any).latestAnswer();
    expect(price).to.be.greaterThan(0n);
  });

  // latestRoundData wraps latestAnswer
  it('latestRoundData returns the same answer as latestAnswer', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    const answer = await (twap as any).latestAnswer();
    const [, roundAnswer] = await (twap as any).latestRoundData();
    expect(BigInt(roundAnswer)).to.equal(answer);
  });
});
