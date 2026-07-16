import {expect} from 'chai';
import {network} from 'hardhat';

const conn = await network.create('hardhat');
const {ethers} = conn;

// ── shared constants ──────────────────────────────────────────────────────────

const DECIMALS_6 = 6;
const DECIMALS_8 = 8;
const DECIMALS_18 = 18;
const UNIT_6 = 10n ** 6n;
const MIN_MAX_STALENESS = 5 * 60; // 5 minutes in seconds
const MIN_TWAP_WINDOW = 300; // seconds (matches A7A5UsdtTwapOracle.MIN_TWAP_WINDOW)

// ── factory helpers ───────────────────────────────────────────────────────────

/** Deploy two MockChainlinkFeed + MockWA7A5 + MockToken and then A7A5NativeOracle. */
async function deployNativeOracle(
  overrides: {
    ethPerUsdt?: bigint;
    usdtPerA7A5?: bigint;
    ethFeedUpdatedAt?: number;
    maxStaleness?: number;
  } = {},
) {
  const [deployer] = await ethers.getSigners();

  const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await a7a5Token.waitForDeployment();

  const wa7a5 = await ethers.deployContract('MockWA7A5', [await a7a5Token.getAddress(), BigInt(10 ** DECIMALS_6), DECIMALS_6]);
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
async function deployTwapOracle(
  overrides: {
    tickCumulatives?: [bigint, bigint];
    wa7a5Ratio?: bigint;
    window?: number;
    token0IsWA7A5?: boolean;
  } = {},
) {
  const [deployer] = await ethers.getSigners();

  const a7a5Token = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await a7a5Token.waitForDeployment();
  const a7a5Addr = await a7a5Token.getAddress();

  const wa7a5 = await ethers.deployContract('MockWA7A5', [a7a5Addr, overrides.wa7a5Ratio ?? BigInt(10 ** DECIMALS_6), DECIMALS_6]);
  await wa7a5.waitForDeployment();
  const wa7a5Addr = await wa7a5.getAddress();

  const usdt = await ethers.deployContract('MockToken', [DECIMALS_6]);
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();

  // Token ordering: wa7a5 and usdt sort by address.
  const t0IsWA7A5 = overrides.token0IsWA7A5 ?? wa7a5Addr.toLowerCase() < usdtAddr.toLowerCase();
  const pool = await ethers.deployContract('MockPool', [t0IsWA7A5 ? wa7a5Addr : usdtAddr, t0IsWA7A5 ? usdtAddr : wa7a5Addr]);
  await pool.waitForDeployment();

  const window = overrides.window ?? MIN_TWAP_WINDOW;

  if (overrides.tickCumulatives) {
    const [older, newer] = overrides.tickCumulatives;
    await (pool as any).setCumulatives(older, newer);
  }

  const twap = await ethers.deployContract('A7A5UsdtTwapOracle', [await pool.getAddress(), wa7a5Addr, usdtAddr, window, await deployer.getAddress()]);
  await twap.waitForDeployment();

  return {deployer, a7a5Token, wa7a5, usdt, pool, twap, wa7a5Addr, usdtAddr};
}

async function deployV2Oracle(minReserveA7A5 = UNIT_6, reserves: [bigint, bigint] = [1_000_000n * UNIT_6, 100_000n * UNIT_6], reverse = false) {
  const a7a5 = await ethers.deployContract('MockSwapToken', ['A7A5', 'A7A5', DECIMALS_6]);
  const usdt = await ethers.deployContract('MockSwapToken', ['USDT', 'USDT', DECIMALS_6]);
  const pair = await ethers.deployContract('MockSecurityV2Pair', [
    reverse ? await usdt.getAddress() : await a7a5.getAddress(),
    reverse ? await a7a5.getAddress() : await usdt.getAddress(),
  ]);
  await pair.waitForDeployment();
  await (pair as any).setReserves(reverse ? reserves[1] : reserves[0], reverse ? reserves[0] : reserves[1]);
  const oracle = await ethers.deployContract('A7A5UsdtV2Oracle', [
    await pair.getAddress(),
    await a7a5.getAddress(),
    await usdt.getAddress(),
    minReserveA7A5,
  ]);
  await oracle.waitForDeployment();
  return {a7a5, usdt, pair, oracle};
}

async function deployUsdtNativeOracle(overrides: {answer?: bigint; updatedAt?: number; maxStaleness?: number} = {}) {
  const [owner] = await ethers.getSigners();
  const now = (await ethers.provider.getBlock('latest'))!.timestamp;
  const feed = await ethers.deployContract('MockChainlinkFeed', [overrides.answer ?? 400_000_000_000_000n, overrides.updatedAt ?? now, DECIMALS_18]);
  const oracle = await ethers.deployContract('UsdtNativeOracle', [
    await feed.getAddress(),
    overrides.maxStaleness ?? 2 * 24 * 3600,
    await owner.getAddress(),
  ]);
  await oracle.waitForDeployment();
  return {owner, feed, oracle};
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
    ).to.be.revertedWithCustomError(
      {interface: (await ethers.getContractFactory('A7A5NativeOracle')).interface} as any,
      'A7A5NativeOracle__StalenessTooLow',
    );
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
    await expect((oracle as any).setMaxStaleness(MIN_MAX_STALENESS - 1)).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__StalenessTooLow');
  });

  // Line 98: tokenPriceData reverts when ethPerUsdt feed returns zero/negative
  it('tokenPriceData reverts when the ETH/USDT feed answer is zero', async function () {
    const {oracle, usdtEthFeed} = await deployNativeOracle();
    await (usdtEthFeed as any).setAnswer(0n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__InvalidPrice');
  });

  it('tokenPriceData reverts when the ETH/USDT feed answer is negative', async function () {
    const {oracle, usdtEthFeed} = await deployNativeOracle();
    await (usdtEthFeed as any).setAnswer(-1n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__InvalidPrice');
  });

  // Line 101: tokenPriceData reverts when A7A5/USDT feed returns zero/negative
  it('tokenPriceData reverts when the A7A5/USDT feed answer is zero', async function () {
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(0n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__InvalidPrice');
  });

  it('tokenPriceData reverts when the A7A5/USDT feed answer is negative', async function () {
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(-1n);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__InvalidPrice');
  });

  // Line 105: tokenPriceData reverts when computed price rounds down to zero
  it('tokenPriceData reverts when the computed price is zero (denominator too large)', async function () {
    // Make usdtPerA7A5 astronomically large so NUMERATOR / denominator = 0.
    const {oracle, a7a5UsdtFeed} = await deployNativeOracle();
    await (a7a5UsdtFeed as any).setAnswer(BigInt(10 ** 30)); // enormous denominator
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__InvalidPrice');
  });

  // Sanity: tokenPriceData returns positive values with valid feeds
  it('tokenPriceData returns a positive price and a future validUntil', async function () {
    const {oracle} = await deployNativeOracle();
    const [price, validUntil] = await (oracle as any).tokenPriceData();
    expect(price).to.be.greaterThan(0n);
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    expect(BigInt(validUntil)).to.be.greaterThan(now);
  });

  it('rejects incomplete Chainlink rounds and stale tokenPrice reads', async function () {
    const {oracle, usdtEthFeed} = await deployNativeOracle();
    await (usdtEthFeed as any).setRound(2, 1);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__IncompleteRound');

    await (usdtEthFeed as any).setRound(2, 2);
    await (usdtEthFeed as any).setUpdatedAt(1);
    await expect((oracle as any).tokenPrice()).to.be.revertedWithCustomError(oracle, 'A7A5NativeOracle__StalePrice');
    const [price, validUntil] = await (oracle as any).tokenPriceData();
    expect(price).to.be.greaterThan(0n);
    expect(validUntil).to.be.lessThan(BigInt((await ethers.provider.getBlock('latest'))!.timestamp));
  });

  it('enforces ownership for staleness changes and rejects zero constructor dependencies', async function () {
    const {oracle} = await deployNativeOracle();
    const [, other] = await ethers.getSigners();
    await expect((oracle as any).connect(other).setMaxStaleness(MIN_MAX_STALENESS)).to.be.revertedWithCustomError(
      oracle,
      'OwnableUnauthorizedAccount',
    );

    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('A7A5NativeOracle');
    await expect(
      factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, MIN_MAX_STALENESS, await owner.getAddress()),
    ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'A7A5NativeOracle__ZeroAddress');
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
    const pool = await ethers.deployContract('MockPool', [t0IsWA7A5 ? wa7a5Addr : usdtAddr, t0IsWA7A5 ? usdtAddr : wa7a5Addr]);
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
    await expect((twap as any).getRoundData(1n)).to.be.revertedWithCustomError(twap, 'A7A5UsdtTwapOracle__NoHistoricalData');
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
    await expect((twap as any).setTwapWindow(MIN_TWAP_WINDOW - 1)).to.be.revertedWithCustomError(twap, 'A7A5UsdtTwapOracle__WindowTooShort');
  });

  // Line 107: latestAnswer reverts when getA7A5BywA7A5 returns 0
  it('latestAnswer reverts when the wA7A5 ratio is zero', async function () {
    const {twap} = await deployTwapOracle({
      tickCumulatives: [0n, 60n],
      wa7a5Ratio: 0n,
    });
    await expect((twap as any).latestAnswer()).to.be.revertedWithCustomError(twap, 'A7A5UsdtTwapOracle__InvalidRatio');
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
    const delta = HIGH_TICK * BigInt(WINDOW);
    // Deploy without cumulatives to discover the actual token address ordering.
    const {twap, pool, wa7a5Addr, usdtAddr} = await deployTwapOracle({});
    // tick > 443637 → sqrtRatioX96 > uint128.max → exercises the else branch.
    // price > 0 only when WA7A5 is token0 (lower address); 0 otherwise — both correct.
    await (pool as any).setCumulatives(0n, delta);
    const price = await (twap as any).latestAnswer();
    if (wa7a5Addr.toLowerCase() < usdtAddr.toLowerCase()) {
      expect(price).to.be.greaterThan(0n);
    } else {
      expect(price).to.equal(0n);
    }
  });

  // latestRoundData wraps latestAnswer
  it('latestRoundData returns the same answer as latestAnswer', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 60n]});
    const answer = await (twap as any).latestAnswer();
    const [, roundAnswer] = await (twap as any).latestRoundData();
    expect(BigInt(roundAnswer)).to.equal(answer);
  });

  it('surfaces insufficient observation history from the pool', async function () {
    const {twap, pool} = await deployTwapOracle({tickCumulatives: [0n, 0n]});
    await (pool as any).setObserveReverts(true);
    await expect((twap as any).latestAnswer()).to.be.revertedWith('OLD');
  });

  it('moves monotonically with sustained tick manipulation in the expected token-order direction', async function () {
    const {twap, pool, wa7a5Addr, usdtAddr} = await deployTwapOracle({tickCumulatives: [0n, 0n]});
    const neutral = await (twap as any).latestAnswer();
    await (pool as any).setCumulatives(0n, 1_000n * BigInt(MIN_TWAP_WINDOW));
    const manipulated = await (twap as any).latestAnswer();
    if (wa7a5Addr.toLowerCase() < usdtAddr.toLowerCase()) {
      expect(manipulated).to.be.greaterThan(neutral);
    } else {
      expect(manipulated).to.be.lessThan(neutral);
    }
  });

  it('enforces owner-only window changes and rejects zero constructor dependencies', async function () {
    const {twap} = await deployTwapOracle({tickCumulatives: [0n, 0n]});
    const [, other] = await ethers.getSigners();
    await expect((twap as any).connect(other).setTwapWindow(MIN_TWAP_WINDOW)).to.be.revertedWithCustomError(twap, 'OwnableUnauthorizedAccount');

    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('A7A5UsdtTwapOracle');
    await expect(
      factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, MIN_TWAP_WINDOW, await owner.getAddress()),
    ).to.be.revertedWithCustomError({interface: factory.interface} as any, 'A7A5UsdtTwapOracle__ZeroAddress');
  });
});

describe('A7A5UsdtV2Oracle (unit/adversarial)', function () {
  it('prices either reserve ordering and preserves inverse reserve monotonicity', async function () {
    const {pair, oracle} = await deployV2Oracle();
    const baseline = await (oracle as any).latestAnswer();
    const {oracle: reversedOracle} = await deployV2Oracle(UNIT_6, [1_000_000n * UNIT_6, 100_000n * UNIT_6], true);
    expect(await (reversedOracle as any).latestAnswer()).to.equal(baseline);
    await (pair as any).setReserves(2_000_000n * UNIT_6, 100_000n * UNIT_6);
    const deeperA7A5 = await (oracle as any).latestAnswer();
    await (pair as any).setReserves(1_000_000n * UNIT_6, 200_000n * UNIT_6);
    const deeperUsdt = await (oracle as any).latestAnswer();
    expect(deeperA7A5).to.be.lessThan(baseline);
    expect(deeperUsdt).to.be.greaterThan(baseline);
  });

  it('rejects thin and empty A7A5 liquidity at the configured threshold', async function () {
    const threshold = 1_000n * UNIT_6;
    const {pair, oracle} = await deployV2Oracle(threshold, [threshold, 100_000n * UNIT_6]);
    expect(await (oracle as any).latestAnswer()).to.be.greaterThan(0n);
    await (pair as any).setReserves(threshold - 1n, 100_000n * UNIT_6);
    await expect((oracle as any).latestAnswer()).to.be.revertedWithCustomError(oracle, 'A7A5UsdtV2Oracle__InsufficientLiquidity');
    await (pair as any).setReserves(0n, 100_000n * UNIT_6);
    await expect((oracle as any).latestAnswer()).to.be.revertedWithCustomError(oracle, 'A7A5UsdtV2Oracle__InsufficientLiquidity');
  });

  it('rejects zero dependencies, pair mismatches, and historical round requests', async function () {
    const {a7a5, usdt, pair, oracle} = await deployV2Oracle();
    const factory = await ethers.getContractFactory('A7A5UsdtV2Oracle');
    await expect(factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(
      {interface: factory.interface} as any,
      'A7A5UsdtV2Oracle__ZeroAddress',
    );
    const unrelated = await ethers.deployContract('MockSwapToken', ['Unrelated', 'NOPE', DECIMALS_6]);
    await expect(factory.deploy(await pair.getAddress(), await a7a5.getAddress(), await unrelated.getAddress(), 1n)).to.be.revertedWithCustomError(
      {interface: factory.interface} as any,
      'A7A5UsdtV2Oracle__PairMismatch',
    );
    await expect((oracle as any).getRoundData(1)).to.be.revertedWithCustomError(oracle, 'A7A5UsdtV2Oracle__NoHistoricalData');
    expect(await usdt.getAddress()).to.not.equal(await unrelated.getAddress());
  });
});

describe('UsdtNativeOracle (unit/adversarial)', function () {
  it('rejects invalid and incomplete feed answers', async function () {
    const {feed, oracle} = await deployUsdtNativeOracle();
    await (feed as any).setAnswer(0);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'UsdtNativeOracle__InvalidPrice');
    await (feed as any).setAnswer(-1);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'UsdtNativeOracle__InvalidPrice');
    await (feed as any).setAnswer(400_000_000_000_000n);
    await (feed as any).setRound(3, 2);
    await expect((oracle as any).tokenPriceData()).to.be.revertedWithCustomError(oracle, 'UsdtNativeOracle__IncompleteRound');
  });

  it('returns stale validity data but rejects stale tokenPrice', async function () {
    const {oracle} = await deployUsdtNativeOracle({updatedAt: 1});
    const [price, validUntil] = await (oracle as any).tokenPriceData();
    expect(price).to.be.greaterThan(0n);
    expect(validUntil).to.be.lessThan(BigInt((await ethers.provider.getBlock('latest'))!.timestamp));
    await expect((oracle as any).tokenPrice()).to.be.revertedWithCustomError(oracle, 'UsdtNativeOracle__StalePrice');
  });

  it('enforces constructor, owner, and minimum-staleness checks', async function () {
    const {oracle} = await deployUsdtNativeOracle();
    const [owner, other] = await ethers.getSigners();
    await expect((oracle as any).connect(other).setMaxStaleness(MIN_MAX_STALENESS)).to.be.revertedWithCustomError(
      oracle,
      'OwnableUnauthorizedAccount',
    );
    await expect((oracle as any).setMaxStaleness(MIN_MAX_STALENESS - 1)).to.be.revertedWithCustomError(oracle, 'UsdtNativeOracle__StalenessTooLow');

    const factory = await ethers.getContractFactory('UsdtNativeOracle');
    await expect(factory.deploy(ethers.ZeroAddress, MIN_MAX_STALENESS, await owner.getAddress())).to.be.revertedWithCustomError(
      {interface: factory.interface} as any,
      'UsdtNativeOracle__ZeroAddress',
    );
  });
});
