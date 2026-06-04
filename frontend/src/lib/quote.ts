/**
 * Universal on-chain quoting via Uniswap V2/V3 SDK math.
 * No external HTTP calls — reads pool state directly from the chain then runs
 * the swap simulation locally in JS.
 *
 * V2 (A7A5 ↔ USDT):  getReserves() → Pair.getOutputAmount()
 * V3 (wA7A5 ↔ USDT): slot0() + liquidity() → Pool.getOutputAmount()
 */

import JSBI from 'jsbi';
import { Interface } from 'ethers';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { Pair, Route as V2Route } from '@uniswap/v2-sdk';
import { Pool as V3Pool, Route as V3Route, TickListDataProvider, FeeAmount } from '@uniswap/v3-sdk';
import { Trade as RouterTrade } from '@uniswap/router-sdk';
import { SwapRouter } from '@uniswap/universal-router-sdk';
import { getProvider } from './a7a5/helpers';
import type { Addresses } from '../config/addresses';

// ---------- ABIs (minimal) ----------

const V2_PAIR_IFACE = new Interface([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]);

const V3_POOL_IFACE = new Interface([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
  'function tickSpacing() view returns (int24)',
]);

const MULTICALL3_IFACE = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
]);

// ---------- helpers ----------

type MulticallResult = { success: boolean; returnData: string };

async function multicall(
  chainId: number,
  multicall3: string,
  calls: { target: string; fn: string; iface: Interface; args?: unknown[] }[]
): Promise<MulticallResult[]> {
  const encoded = calls.map((c) => ({
    target: c.target,
    allowFailure: true,
    callData: c.iface.encodeFunctionData(c.fn, c.args ?? []),
  }));
  const raw = await getProvider(chainId).call({
    to: multicall3,
    data: MULTICALL3_IFACE.encodeFunctionData('aggregate3', [encoded]),
  });
  const [results] = MULTICALL3_IFACE.decodeFunctionResult('aggregate3', raw) as unknown as [
    MulticallResult[],
  ];
  return results;
}

function requireResult(
  results: MulticallResult[],
  idx: number,
  label: string,
  addr: string
): string {
  const r = results[idx];
  if (!r.success || r.returnData === '0x') {
    throw new Error(
      `${label} call failed at ${addr} — verify the address is correct for this chain`
    );
  }
  return r.returnData;
}

// ---------- public types ----------

export type QuoteResult = {
  amountOut: bigint; // in output token's smallest unit
  amountOutFormatted: string; // human-readable
  priceImpact: string; // e.g. "0.12%"
  protocol: 'V2' | 'V3';
};

/** 'sell' = A7A5/wA7A5 → USDT, 'buy' = USDT → A7A5/wA7A5 */
export type SwapDirection = 'sell' | 'buy';

export type Side = 'A7A5' | 'wA7A5';

// ---------- V2 quote ----------

export async function quoteV2(
  chainId: number,
  addresses: Addresses,
  amountIn: bigint,
  direction: SwapDirection = 'sell',
  /** basisPointsRate from A7A5 contract (0–20) — only applied on the A7A5 leg */
  fotBps = 0
): Promise<QuoteResult> {
  const pairAddr = addresses.A7A5.V2_PAIR_USDT_A7A5;
  if (!pairAddr) throw new Error('V2 pair address not configured for this chain');

  const results = await multicall(chainId, addresses.MULTICALL3, [
    { target: pairAddr, fn: 'getReserves', iface: V2_PAIR_IFACE },
    { target: pairAddr, fn: 'token0', iface: V2_PAIR_IFACE },
  ]);

  const reservesRaw = requireResult(results, 0, 'V2 pair getReserves', pairAddr);
  const token0Raw = requireResult(results, 1, 'V2 pair token0', pairAddr);

  const [reserve0, reserve1] = V2_PAIR_IFACE.decodeFunctionResult('getReserves', reservesRaw);
  const [token0Address] = V2_PAIR_IFACE.decodeFunctionResult('token0', token0Raw);

  const tokenA7A5 = new Token(chainId, addresses.A7A5.A7A5, 6, 'A7A5');
  const tokenUSDT = new Token(chainId, addresses.USDT, 6, 'USDT');

  const isA7A5token0 = token0Address.toLowerCase() === addresses.A7A5.A7A5.toLowerCase();
  const amount0 = CurrencyAmount.fromRawAmount(
    isA7A5token0 ? tokenA7A5 : tokenUSDT,
    JSBI.BigInt(reserve0.toString())
  );
  const amount1 = CurrencyAmount.fromRawAmount(
    isA7A5token0 ? tokenUSDT : tokenA7A5,
    JSBI.BigInt(reserve1.toString())
  );

  const pair = new Pair(amount0, amount1);

  const tokenIn = direction === 'sell' ? tokenA7A5 : tokenUSDT;

  // FoT applies on the A7A5 side. Selling A7A5 → trim input;
  // buying A7A5 → the user *receives* less, trim output post-swap.
  const fotAdjustedIn =
    direction === 'sell' && fotBps > 0 ? amountIn - (amountIn * BigInt(fotBps)) / 10000n : amountIn;

  const inputAmount = CurrencyAmount.fromRawAmount(tokenIn, JSBI.BigInt(fotAdjustedIn.toString()));
  const [outputAmount] = pair.getOutputAmount(inputAmount, direction === 'sell' && fotBps > 0);

  let rawOut = BigInt(outputAmount.quotient.toString());
  if (direction === 'buy' && fotBps > 0) {
    rawOut = rawOut - (rawOut * BigInt(fotBps)) / 10000n;
  }

  // Price impact relative to the side we're pulling from.
  const reserveA7A5 = isA7A5token0 ? BigInt(reserve0.toString()) : BigInt(reserve1.toString());
  const reserveUSDT = isA7A5token0 ? BigInt(reserve1.toString()) : BigInt(reserve0.toString());
  const reserveIn = direction === 'sell' ? reserveA7A5 : reserveUSDT;
  const priceImpactBps = amountIn > 0n && reserveIn > 0n ? (amountIn * 10000n) / reserveIn : 0n;

  return {
    amountOut: rawOut,
    amountOutFormatted: (Number(rawOut) / 1e6).toFixed(6),
    priceImpact: (Number(priceImpactBps) / 100).toFixed(2) + '%',
    protocol: 'V2',
  };
}

// ---------- V3 quote ----------

export async function quoteV3(
  chainId: number,
  addresses: Addresses,
  amountIn: bigint,
  direction: SwapDirection = 'sell'
): Promise<QuoteResult> {
  const poolAddr = addresses.A7A5.V3_POOL_USDT_WA7A5;
  const wa7a5Addr = addresses.A7A5.WA7A5;
  const feeTier = addresses.A7A5.V3_FEE_TIER as FeeAmount | undefined;
  if (!poolAddr || !wa7a5Addr || feeTier === undefined) {
    throw new Error('V3 pool not configured for this chain');
  }

  const results = await multicall(chainId, addresses.MULTICALL3, [
    { target: poolAddr, fn: 'slot0', iface: V3_POOL_IFACE },
    { target: poolAddr, fn: 'liquidity', iface: V3_POOL_IFACE },
    { target: poolAddr, fn: 'tickSpacing', iface: V3_POOL_IFACE },
  ]);

  const slot0Raw = requireResult(results, 0, 'V3 pool slot0', poolAddr);
  const liquidityRaw = requireResult(results, 1, 'V3 pool liquidity', poolAddr);
  const tickSpacingRaw = requireResult(results, 2, 'V3 pool tickSpacing', poolAddr);

  const [sqrtPriceX96, tickCurrent] = V3_POOL_IFACE.decodeFunctionResult('slot0', slot0Raw);
  const [liquidity] = V3_POOL_IFACE.decodeFunctionResult('liquidity', liquidityRaw);
  const [tickSpacing] = V3_POOL_IFACE.decodeFunctionResult('tickSpacing', tickSpacingRaw);

  const tokenWA7A5 = new Token(chainId, wa7a5Addr, 6, 'wA7A5');
  const tokenUSDT = new Token(chainId, addresses.USDT, 6, 'USDT');

  const tick = Number(tickCurrent);
  const spacing = Number(tickSpacing);
  const nearestUsableTick = Math.round(tick / spacing) * spacing;
  const ticks = [
    {
      index: nearestUsableTick - spacing,
      liquidityNet: JSBI.BigInt(0),
      liquidityGross: JSBI.BigInt(0),
    },
    { index: nearestUsableTick, liquidityNet: JSBI.BigInt(0), liquidityGross: JSBI.BigInt(0) },
  ];

  const pool = new V3Pool(
    tokenWA7A5,
    tokenUSDT,
    feeTier,
    JSBI.BigInt(sqrtPriceX96.toString()),
    JSBI.BigInt(liquidity.toString()),
    tick,
    new TickListDataProvider(ticks, spacing)
  );

  const inputToken = direction === 'sell' ? tokenWA7A5 : tokenUSDT;
  const inputAmount = CurrencyAmount.fromRawAmount(inputToken, JSBI.BigInt(amountIn.toString()));
  const [outputAmount] = await pool.getOutputAmount(inputAmount);

  const reserveEquiv = BigInt(liquidity.toString());
  const priceImpactBps =
    amountIn > 0n && reserveEquiv > 0n ? (amountIn * 10000n) / reserveEquiv : 0n;

  const rawOut = BigInt(outputAmount.quotient.toString());
  return {
    amountOut: rawOut,
    amountOutFormatted: (Number(rawOut) / 1e6).toFixed(6),
    priceImpact: (Number(priceImpactBps) / 100).toFixed(2) + '%',
    protocol: 'V3',
  };
}

// ---------- unified entry point ----------

export async function getQuote(
  side: Side,
  amountIn: bigint,
  chainId: number,
  addresses: Addresses,
  fotBps = 0,
  direction: SwapDirection = 'sell'
): Promise<QuoteResult> {
  if (side === 'A7A5') return quoteV2(chainId, addresses, amountIn, direction, fotBps);
  return quoteV3(chainId, addresses, amountIn, direction);
}

// ---------- local calldata builder (no routing API needed) ----------

export type SwapCalldataResult = { calldata: string; value: string; to: string };

/**
 * Build Universal Router calldata locally from on-chain pool state.
 * Replaces the Uniswap routing API for pair-mode swaps — no API key required.
 */
export async function buildPairSwapCalldata(
  side: Side,
  amountIn: bigint,
  chainId: number,
  addresses: Addresses,
  swapper: string,
  slippageBps: number,
  direction: SwapDirection,
  fotBps = 0
): Promise<SwapCalldataResult> {
  if (!addresses.UNISWAP) throw new Error('Uniswap addresses missing on this chain');
  if (side === 'A7A5')
    return _v2Calldata(chainId, addresses, amountIn, swapper, slippageBps, direction, fotBps);
  return _v3Calldata(chainId, addresses, amountIn, swapper, slippageBps, direction);
}

async function _v2Calldata(
  chainId: number,
  addresses: Addresses,
  amountIn: bigint,
  swapper: string,
  slippageBps: number,
  direction: SwapDirection,
  fotBps: number
): Promise<SwapCalldataResult> {
  const pairAddr = addresses.A7A5.V2_PAIR_USDT_A7A5;
  if (!pairAddr) throw new Error('V2 pair address not configured for this chain');

  const results = await multicall(chainId, addresses.MULTICALL3, [
    { target: pairAddr, fn: 'getReserves', iface: V2_PAIR_IFACE },
    { target: pairAddr, fn: 'token0', iface: V2_PAIR_IFACE },
  ]);

  const [reserve0, reserve1] = V2_PAIR_IFACE.decodeFunctionResult(
    'getReserves',
    requireResult(results, 0, 'V2 pair getReserves', pairAddr)
  );
  const [token0Address] = V2_PAIR_IFACE.decodeFunctionResult(
    'token0',
    requireResult(results, 1, 'V2 pair token0', pairAddr)
  );

  const tokenA7A5 = new Token(chainId, addresses.A7A5.A7A5, 6, 'A7A5');
  const tokenUSDT = new Token(chainId, addresses.USDT, 6, 'USDT');
  const isA7A5token0 = token0Address.toLowerCase() === addresses.A7A5.A7A5.toLowerCase();

  const pair = new Pair(
    CurrencyAmount.fromRawAmount(
      isA7A5token0 ? tokenA7A5 : tokenUSDT,
      JSBI.BigInt(reserve0.toString())
    ),
    CurrencyAmount.fromRawAmount(
      isA7A5token0 ? tokenUSDT : tokenA7A5,
      JSBI.BigInt(reserve1.toString())
    )
  );

  const tokenIn = direction === 'sell' ? tokenA7A5 : tokenUSDT;
  const tokenOut = direction === 'sell' ? tokenUSDT : tokenA7A5;
  const fotAdjustedIn =
    direction === 'sell' && fotBps > 0 ? amountIn - (amountIn * BigInt(fotBps)) / 10000n : amountIn;

  const inputCA = CurrencyAmount.fromRawAmount(tokenIn, JSBI.BigInt(fotAdjustedIn.toString()));
  const [outputCA] = pair.getOutputAmount(inputCA, direction === 'sell' && fotBps > 0);
  let rawOut = BigInt(outputCA.quotient.toString());
  if (direction === 'buy' && fotBps > 0) rawOut -= (rawOut * BigInt(fotBps)) / 10000n;
  const outputCAFinal = CurrencyAmount.fromRawAmount(tokenOut, JSBI.BigInt(rawOut.toString()));

  const route = new V2Route([pair], tokenIn, tokenOut);
  const routerTrade = new RouterTrade({
    v2Routes: [{ routev2: route, inputAmount: inputCA, outputAmount: outputCAFinal }],
    tradeType: TradeType.EXACT_INPUT,
  });

  const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
    slippageTolerance: new Percent(slippageBps, 10000),
    recipient: swapper,
    deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000) + 1800,
  });

  return { calldata, value: value ?? '0x0', to: addresses.UNISWAP!.UNIVERSAL_ROUTER };
}

async function _v3Calldata(
  chainId: number,
  addresses: Addresses,
  amountIn: bigint,
  swapper: string,
  slippageBps: number,
  direction: SwapDirection
): Promise<SwapCalldataResult> {
  const poolAddr = addresses.A7A5.V3_POOL_USDT_WA7A5;
  const wa7a5Addr = addresses.A7A5.WA7A5;
  const feeTier = addresses.A7A5.V3_FEE_TIER as FeeAmount | undefined;
  if (!poolAddr || !wa7a5Addr || feeTier === undefined)
    throw new Error('V3 pool not configured for this chain');

  const results = await multicall(chainId, addresses.MULTICALL3, [
    { target: poolAddr, fn: 'slot0', iface: V3_POOL_IFACE },
    { target: poolAddr, fn: 'liquidity', iface: V3_POOL_IFACE },
    { target: poolAddr, fn: 'tickSpacing', iface: V3_POOL_IFACE },
  ]);

  const [sqrtPriceX96, tickCurrent] = V3_POOL_IFACE.decodeFunctionResult(
    'slot0',
    requireResult(results, 0, 'V3 pool slot0', poolAddr)
  );
  const [liquidity] = V3_POOL_IFACE.decodeFunctionResult(
    'liquidity',
    requireResult(results, 1, 'V3 pool liquidity', poolAddr)
  );
  const [tickSpacing] = V3_POOL_IFACE.decodeFunctionResult(
    'tickSpacing',
    requireResult(results, 2, 'V3 pool tickSpacing', poolAddr)
  );

  const tokenWA7A5 = new Token(chainId, wa7a5Addr, 6, 'wA7A5');
  const tokenUSDT = new Token(chainId, addresses.USDT, 6, 'USDT');
  const tick = Number(tickCurrent);
  const spacing = Number(tickSpacing);
  const nearestUsableTick = Math.round(tick / spacing) * spacing;

  const pool = new V3Pool(
    tokenWA7A5,
    tokenUSDT,
    feeTier,
    JSBI.BigInt(sqrtPriceX96.toString()),
    JSBI.BigInt(liquidity.toString()),
    tick,
    new TickListDataProvider(
      [
        { index: nearestUsableTick - spacing, liquidityNet: JSBI.BigInt(0), liquidityGross: JSBI.BigInt(0) },
        { index: nearestUsableTick, liquidityNet: JSBI.BigInt(0), liquidityGross: JSBI.BigInt(0) },
      ],
      spacing
    )
  );

  const inputToken = direction === 'sell' ? tokenWA7A5 : tokenUSDT;
  const outputToken = direction === 'sell' ? tokenUSDT : tokenWA7A5;
  const inputCA = CurrencyAmount.fromRawAmount(inputToken, JSBI.BigInt(amountIn.toString()));
  const [outputCA] = await pool.getOutputAmount(inputCA);

  const route = new V3Route([pool], inputToken, outputToken);
  const routerTrade = new RouterTrade({
    v3Routes: [{ routev3: route, inputAmount: inputCA, outputAmount: outputCA }],
    tradeType: TradeType.EXACT_INPUT,
  });

  const { calldata, value } = SwapRouter.swapCallParameters(routerTrade, {
    slippageTolerance: new Percent(slippageBps, 10000),
    recipient: swapper,
    deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000) + 1800,
  });

  return { calldata, value: value ?? '0x0', to: addresses.UNISWAP!.UNIVERSAL_ROUTER };
}
