import {expect} from 'chai';
import {ADDRESSES} from '../../common/addresses.js';
import {forkReady} from '../helpers.js';
import {readV2Reserves} from './helpers.js';
import {ethers, loadFixture, provider} from './consts.js';
import {buyFixture, deployFacadeFixture, fotFixture, sellFixture, v3SellFixture} from './fixtures.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PoolsFacade (mainnet fork)', function () {
  this.timeout(240_000);

  if (!forkReady(ADDRESSES.A7A5, ADDRESSES.WA7A5)) {
    it.skip('requires MAINNET_FORK=1 and real A7A5/WA7A5 addresses', () => {});
    return;
  }

  // Pre-warm all fixture snapshots from clean fork state before any test
  // mutates EVM storage (e.g. setV2Reserve in quote tests). Without this,
  // buyFixture/sellFixture could be snapshotted against modified reserves.
  before(async function () {
    await loadFixture(deployFacadeFixture);
    await loadFixture(buyFixture);
    await loadFixture(sellFixture);
    await loadFixture(v3SellFixture);
    await loadFixture(fotFixture);
  });

  // ── basic ──────────────────────────────────────────────────────────────
  describe('basic', function () {
    it('constructor: reverts with PoolsFacade__InvalidV2Pair when pair tokens mismatch', async () => {
      console.log('\n  ── Constructor: invalid pair ──────────────────────────');
      const [deployer] = await ethers.getSigners();
      const deployerAddr = await deployer.getAddress();
      await expect(
        ethers.deployContract('PoolsFacade', [
          ADDRESSES.WA7A5,
          ADDRESSES.WETH,
          ADDRESSES.USDT,
          ADDRESSES.V2_PAIR_USDT_A7A5,
          ADDRESSES.SWAP_ROUTER_02,
          ADDRESSES.QUOTER_V2,
          ADDRESSES.V3_FEE_TIER,
          deployerAddr,
        ]),
      ).to.be.revertedWithCustomError({interface: (await ethers.getContractFactory('PoolsFacade')).interface} as any, 'PoolsFacade__InvalidV2Pair');
    });

    it('wires all immutables correctly', async () => {
      console.log('\n  ── Wiring ─────────────────────────────────────────────');
      const {facade} = await loadFixture(deployFacadeFixture);
      const checks: Array<[string, string, string]> = [
        ['WA7A5', (await facade.WA7A5()).toLowerCase(), ADDRESSES.WA7A5.toLowerCase()],
        ['A7A5', (await facade.A7A5()).toLowerCase(), ADDRESSES.A7A5.toLowerCase()],
        ['USDT', (await facade.USDT()).toLowerCase(), ADDRESSES.USDT.toLowerCase()],
        ['V2_PAIR', (await facade.V2_PAIR()).toLowerCase(), ADDRESSES.V2_PAIR_USDT_A7A5.toLowerCase()],
        ['V3_ROUTER', (await facade.V3_ROUTER()).toLowerCase(), ADDRESSES.SWAP_ROUTER_02.toLowerCase()],
        ['V3_QUOTER', (await facade.V3_QUOTER()).toLowerCase(), ADDRESSES.QUOTER_V2.toLowerCase()],
      ];
      for (const [name, actual, expected] of checks) {
        console.log(`        ${name.padEnd(12)} ${actual}`);
        expect(actual, name).to.equal(expected);
      }
      const fee = await facade.WA7A5_USDT_V3_FEE();
      console.log(`        WA7A5_USDT_V3_FEE  ${fee}`);
      expect(fee).to.equal(BigInt(ADDRESSES.V3_FEE_TIER));
      const isToken0: boolean = await facade.V2_A7A5_IS_TOKEN0();
      console.log(`        V2_A7A5_IS_TOKEN0  ${isToken0}`);
      const {reserveA7A5, reserveUsdt} = await readV2Reserves(provider, ADDRESSES.V2_PAIR_USDT_A7A5);
      console.log(`        V2 reserves     A7A5=${ethers.formatUnits(reserveA7A5, 6)}  USDT=${ethers.formatUnits(reserveUsdt, 6)}`);
      expect(typeof isToken0).to.equal('boolean');
    });
  });
});
