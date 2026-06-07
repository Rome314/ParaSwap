import {ADDRESSES} from '../../common/addresses.js';
import {fundFromWhale} from '../helpers.js';
import {conn, ethers, networkHelpers, USDT_IN, WA7A5_IN, USDC_IN, WETH_IN} from './consts.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';
import {IWA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IWA7A5__factory.js';
import type {ParaSwap} from '../../types/ethers-contracts/ParaSwap.js';
import type {PoolsFacade} from '../../types/ethers-contracts/PoolsFacade.js';

// ── FOT helpers ───────────────────────────────────────────────────────────────

async function findBpsSlot(): Promise<number> {
  const a7a5 = IA7A5__factory.connect(ADDRESSES.A7A5, ethers.provider);
  const PROBE = 42n;
  for (let slot = 0; slot < 30; slot++) {
    const snap = await networkHelpers.takeSnapshot();
    await networkHelpers.setStorageAt(ADDRESSES.A7A5, slot, PROBE);
    const val: bigint = await a7a5.basisPointsRate();
    await snap.restore();
    if (val === PROBE) return slot;
  }
  throw new Error('basisPointsRate slot not found in slots 0–29');
}

async function enableFot(bpsSlot: number): Promise<void> {
  const a7a5 = IA7A5__factory.connect(ADDRESSES.A7A5, ethers.provider);
  const prec: bigint = await a7a5.FEE_PRECISION();
  await networkHelpers.setStorageAt(ADDRESSES.A7A5, bpsSlot, prec / 100n); // 1% FOT
}

// ── Base fixture: deploy PoolsFacade + ParaSwap ───────────────────────────────

export async function deployParaSwapFixture() {
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

  const paraSwap = (await ethers.deployContract('ParaSwap', [facadeAddr, ADDRESSES.SWAP_ROUTER_02])) as unknown as ParaSwap;
  await paraSwap.waitForDeployment();
  const paraSwapAddr = await paraSwap.getAddress();

  return {facade, facadeAddr, paraSwap, paraSwapAddr, trader, traderAddr};
}

// ── Funded fixture: deploy + fund trader with every token (no approvals) ─────
// A7A5 remaining after wrap = WA7A5_IN * 2n - WA7A5_IN = A7A5_IN (same value)

export async function fundedFixture() {
  const base = await deployParaSwapFixture();
  const a7a5 = IA7A5__factory.connect(ADDRESSES.A7A5, base.trader);
  const wa7a5 = IWA7A5__factory.connect(ADDRESSES.WA7A5, base.trader);

  await fundFromWhale(conn, ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE, base.traderAddr, WA7A5_IN * 2n);
  await (a7a5 as any).approve(ADDRESSES.WA7A5, WA7A5_IN * 2n);
  await (wa7a5 as any).wrap(WA7A5_IN);
  const wa7a5Balance: bigint = await wa7a5.balanceOf(base.traderAddr);

  await fundFromWhale(conn, ADDRESSES.USDT, ADDRESSES.USDT_WHALE, base.traderAddr, USDT_IN);
  await fundFromWhale(conn, ADDRESSES.USDC, ADDRESSES.USDC_WHALE, base.traderAddr, USDC_IN);
  await fundFromWhale(conn, ADDRESSES.WETH, ADDRESSES.WETH_WHALE, base.traderAddr, WETH_IN);

  return {...base, wa7a5Balance};
}

// ── FOT fixture: deploy + fund + A7A5 FOT=1% enabled ─────────────────────────
// Wrapping happens before FOT is active so wa7a5Balance is unaffected by FOT.

export async function fotFixture() {
  const bpsSlot = await findBpsSlot();
  const funded = await fundedFixture();
  await enableFot(bpsSlot);
  return funded;
}
