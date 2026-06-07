import {network} from 'hardhat';
import {ERC20_TRANSFER_ABI} from '../common/abi.js';
import type {BigNumberish} from 'ethers/utils';
import {formatUnits} from 'ethers';

export function formatUnits6(input: BigNumberish): string {
  return formatUnits(input, 6);
}

export function formatUnits18(input: BigNumberish): string {
  return formatUnits(input, 18);
}

export const abs = (a: bigint, b: bigint) => (a > b ? a - b : b - a);

// The object returned by `network.create()` (ethers + networkHelpers, etc.).
export type Conn = Awaited<ReturnType<typeof network.create>>;

/**
 * Impersonate any mainnet address on the fork and fund it with ETH for gas.
 * No private key needed — a fork can sign as any account.
 */
export async function impersonate(conn: Conn, addr: string, gasEth = '10') {
  await conn.networkHelpers.setBalance(addr, conn.ethers.parseEther(gasEth));
  return conn.ethers.getImpersonatedSigner(addr);
}

/**
 * Move `amount` of an ERC-20 from a real holder ("whale") to `to`, by
 * impersonating the holder. Returns the amount actually received (handles
 * fee-on-transfer tokens like A7A5 via balance delta).
 */
export async function fundFromWhale(conn: Conn, token: string, whale: string, to: string, amount: bigint): Promise<bigint> {
  const holder = await impersonate(conn, whale);
  const erc20 = new conn.ethers.Contract(token, ERC20_TRANSFER_ABI, holder);
  const before: bigint = await erc20.balanceOf(to);
  await (await erc20.transfer(to, amount)).wait();
  const after: bigint = await erc20.balanceOf(to);
  return after - before;
}

const ZERO = '0x0000000000000000000000000000000000000000';

/** True when fork tests should run (MAINNET_FORK set and the address is real). */
export function forkReady(...addrs: string[]): boolean {
  return Boolean(process.env.MAINNET_FORK) && addrs.every((a) => a && a !== ZERO);
}
