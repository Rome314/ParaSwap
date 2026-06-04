import {network} from 'hardhat';

export const conn = await network.create('hardhat');
export const {ethers, networkHelpers} = conn;
export const {loadFixture} = networkHelpers;
export const provider = ethers.provider;

export enum SIDE {
  BUY = 0,
  SELL = 1,
}
export enum STRATEGY {
  DIRECT = 0,
  MIXED = 1,
}

export const USDT_IN = 1_000_000n;
export const A7A5_IN = 1_000_000_000n;
export const WA7A5_IN = 1_000_000_000n;
export const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);
export const PAST_DEADLINE = 1n;
export const mask112 = (1n << 112n) - 1n;
