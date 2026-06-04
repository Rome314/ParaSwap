import {network} from 'hardhat';

export const conn = await network.create('hardhat');
export const {ethers, networkHelpers} = conn;
export const {loadFixture} = networkHelpers;
export const provider = ethers.provider;

export const USDT_IN = 1_000_000n; // 1 USDT  (6 dec)
export const A7A5_IN = 1_000_000_000n; // 1000 A7A5 (6 dec)
export const WA7A5_IN = 1_000_000_000n; // 1000 wA7A5 (6 dec)
export const USDC_IN = 1_000_000n; // 1 USDC  (6 dec)
export const WETH_IN = 100_000_000_000_000_000n; // 0.1 WETH (18 dec)

export const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);
export const PAST_DEADLINE = 1n;

export const NO_FEE = 0n;
export const V3_FEE_WA7A5 = 500n; // wA7A5/USDT pool
export const V3_FEE_USDC = 100n; // USDC/USDT pool (0.01%)
export const V3_FEE_WETH = 500n; // WETH/USDT pool (0.05%)
