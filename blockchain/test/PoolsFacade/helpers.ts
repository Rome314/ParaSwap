// ─── Helpers ────────────────────────────────────────────────────────────────

import {ContractTransactionReceipt, Provider} from 'ethers';
import {ethers, mask112, networkHelpers, provider} from './consts.js';
import {IA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IA7A5__factory.js';
import {IWA7A5__factory} from '../../types/ethers-contracts/factories/interfaces/IA7A5.sol/IWA7A5__factory.js';
import {ADDRESSES} from '../../common/addresses.js';
import {SnapshotRestorer} from '@nomicfoundation/hardhat-network-helpers/types';
import {V2Pair__factory} from '../../types/ethers-contracts/factories/interfaces/Uniswap.sol/V2Pair__factory.js';

export function tokens() {
  return {
    // TODO: use IERC20 for USDT
    usdt: IA7A5__factory.connect(ADDRESSES.USDT, provider),
    a7a5: IA7A5__factory.connect(ADDRESSES.A7A5, provider),
    wa7a5: IWA7A5__factory.connect(ADDRESSES.WA7A5, provider),
  };
}

export async function revertMsg(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return '';
  } catch (e: any) {
    return e.shortMessage ?? e.message ?? String(e);
  }
}

export async function zeroV2Reserves(pairAddr: string): Promise<SnapshotRestorer> {
  const snap = await networkHelpers.takeSnapshot();
  const slotRaw = BigInt(await provider.getStorage(pairAddr, 8));
  const tsLast = slotRaw >> 224n;
  await networkHelpers.setStorageAt(pairAddr, 8, tsLast << 224n);
  return snap;
}

// null for r0 or r1 means "keep current value"
export async function setV2Reserve(pairAddr: string, r0: bigint | null, r1: bigint | null): Promise<SnapshotRestorer> {
  const snap = await networkHelpers.takeSnapshot();
  const slotRaw = BigInt(await provider.getStorage(pairAddr, 8));
  const cur0 = slotRaw & mask112;
  const cur1 = (slotRaw >> 112n) & mask112;
  const tsLast = slotRaw >> 224n;
  const newSlot = (tsLast << 224n) | ((r1 ?? cur1) << 112n) | (r0 ?? cur0);
  await networkHelpers.setStorageAt(pairAddr, 8, newSlot);
  return snap;
}

export async function findBpsSlot(a7a5Addr: string): Promise<number> {
  const {a7a5} = tokens();
  const PROBE = 42n;
  for (let slot = 0; slot < 30; slot++) {
    const snap = await networkHelpers.takeSnapshot();
    await networkHelpers.setStorageAt(a7a5Addr, slot, PROBE);
    const val: bigint = await a7a5.basisPointsRate();
    await snap.restore();
    if (val === PROBE) return slot;
  }
  throw new Error('basisPointsRate slot not found in slots 0–29');
}

export function gasUsedEthStr(rcp: ContractTransactionReceipt | null): string {
  if (!rcp) return '?';
  return ethers.formatEther(rcp.gasUsed * rcp.gasPrice);
}

/** Returns the raw (6-dec) reserve amounts split by which side is A7A5. */
export async function readV2Reserves(provider: Provider, pairAddr: string): Promise<{reserveA7A5: bigint; reserveUsdt: bigint}> {
  const pair = V2Pair__factory.connect(pairAddr, provider);
  const [r0, r1] = await pair.getReserves();
  const token0: string = await pair.token0();
  const a7a5IsToken0 = token0.toLowerCase() === ADDRESSES.A7A5.toLowerCase();
  return {
    reserveA7A5: a7a5IsToken0 ? r0 : r1,
    reserveUsdt: a7a5IsToken0 ? r1 : r0,
  };
}
