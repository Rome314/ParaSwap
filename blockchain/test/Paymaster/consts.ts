import {network} from 'hardhat';

export const conn = await network.create('hardhat');
export const {ethers, networkHelpers} = conn;
export const {loadFixture} = networkHelpers;
export const provider = ethers.provider;

export enum SIDE {
  BUY = 0,
  SELL = 1,
}

// A7A5 and USDT both have 6 decimals on mainnet.
export const A7A5_GAS_FUNDING = 5_000_000_000n; // 5,000 A7A5 held by the account to cover gas + swap
export const A7A5_SWAP_IN = 1_000_000_000n; // 1,000 A7A5 swapped to USDT in the e2e
export const USDT_POKE = 1_000_000n; // 1 USDT per TWAP warm-up poke

export const TWAP_WINDOW = 300; // seconds (matches MIN_TWAP_WINDOW in A7A5UsdtTwapOracle)
export const MAX_STALENESS = 2 * 24 * 60 * 60; // 2 days, > Chainlink USDT/ETH heartbeat
export const FAR_DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);

// Minimal Uniswap V3 pool surface used to warm up the observation buffer in tests.
export const V3_POOL_ABI = [
  'function increaseObservationCardinalityNext(uint16 observationCardinalityNext)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];
