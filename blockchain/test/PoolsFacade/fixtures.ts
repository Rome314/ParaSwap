// ─── Fixtures ───────────────────────────────────────────────────────────────

import {ADDRESSES} from '../../common/addresses.js';
import {V2Pair__factory} from '../../types/ethers-contracts/factories/interfaces/Uniswap.sol/V2Pair__factory.js';
import type {V2Pair} from '../../types/ethers-contracts/interfaces/Uniswap.sol/V2Pair.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.js';
import {fundFromWhale} from '../helpers.js';
import {A7A5_IN, conn, ethers, networkHelpers, USDT_IN, WA7A5_IN} from './consts.js';
import {findBpsSlot, tokens} from './helpers.js';

export async function deployFacadeFixture() {
  const [, trader] = await ethers.getSigners();
  const traderAddr = await trader.getAddress();
  const facade = (await ethers.deployContract('PoolsFacade', [
    ADDRESSES.WA7A5,
    ADDRESSES.A7A5,
    ADDRESSES.USDT,
    ADDRESSES.V2_PAIR_USDT_A7A5,
    ADDRESSES.SWAP_ROUTER_02,
    ADDRESSES.QUOTER_V2,
    ADDRESSES.V3_FEE_TIER,
  ])) as unknown as PoolsFacade;
  await facade.waitForDeployment();
  const facadeAddr = await facade.getAddress();
  const bpsSlot = await findBpsSlot(ADDRESSES.A7A5);

  const v2Pair: V2Pair = await V2Pair__factory.connect(ADDRESSES.V2_PAIR_USDT_A7A5);

  return {facade, v2Pair, facadeAddr, trader, traderAddr, bpsSlot};
}

export async function buyFixture() {
  const base = await deployFacadeFixture();
  const {usdt} = tokens();
  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, base.traderAddr, USDT_IN);
  await (usdt.connect(base.trader) as any).approve(base.facadeAddr, USDT_IN);
  return base;
}

export async function sellFixture() {
  const base = await deployFacadeFixture();
  const {a7a5} = tokens();
  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, base.traderAddr, A7A5_IN * 2n);
  await (a7a5.connect(base.trader) as any).approve(base.facadeAddr, A7A5_IN);
  return base;
}

export async function v3SellFixture() {
  const base = await deployFacadeFixture();
  const {a7a5, wa7a5} = tokens();
  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, base.traderAddr, WA7A5_IN * 2n);
  await (a7a5.connect(base.trader) as any).approve(ADDRESSES.WA7A5, WA7A5_IN * 2n);
  await (wa7a5.connect(base.trader) as any).wrap(WA7A5_IN);
  return {...base};
}

export async function fotFixture() {
  const base = await deployFacadeFixture();
  const {a7a5} = tokens();
  const prec: bigint = await a7a5.FEE_PRECISION();
  await networkHelpers.setStorageAt(ADDRESSES.A7A5, base.bpsSlot, prec / 100n); // 1%
  return base;
}
