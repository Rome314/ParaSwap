/**
 * A7A5MultiRouter – TypeScript integration
 * Shows: quoting both paths, picking the best, then executing the swap.
 *
 *  npm i ethers @uniswap/v4-sdk @uniswap/sdk-core
 */

import {ethers, MaxUint256} from 'ethers';

// ── ABIs (minimal) ──────────────────────────────────────────────────────────

const ROUTER_ABI = [
  // Swap A7A5 → any token (first-hop selectable)
  `function swapA7A5ForToken(
      uint256 amountIn,
      uint256 minUSDT,
      uint8   firstHop,
      (address tokenOut, uint256 amountOutMinimum, bool useV4,
       uint24 v3Fee, uint24 v4Fee, int24 v4TickSpacing, address v4Hooks) hop2,
      uint256 deadline
  ) returns (uint256 amountOut)`,

  // Swap wA7A5 → any token
  `function swapWA7A5ForToken(
      uint256 wa7a5AmountIn,
      uint256 minUSDT,
      (address tokenOut, uint256 amountOutMinimum, bool useV4,
       uint24 v3Fee, uint24 v4Fee, int24 v4TickSpacing, address v4Hooks) hop2,
      uint256 deadline
  ) returns (uint256 amountOut)`,

  // Best-path quote (eth_call only)
  `function getBestA7A5Route(
      uint256 a7a5AmountIn,
      uint24  secondHopV3Fee,
      address tokenOut
  ) returns (uint8 bestPath, uint256 bestUSDT, uint256 bestFinalOut)`,

  // Specific quote (eth_call only)
  `function quoteA7A5ForToken(
      uint256 a7a5AmountIn,
      uint8   firstHop,
      (address tokenOut, uint256 amountOutMinimum, bool useV4,
       uint24 v3Fee, uint24 v4Fee, int24 v4TickSpacing, address v4Hooks) hop2
  ) returns (uint256 usdtMid, uint256 amountOut)`,
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ── Enums matching the Solidity contract ───────────────────────────────────

enum FirstHopPath {
  A7A5_V2 = 0, // A7A5 → USDT via V2 pair
  WA7A5_V3 = 1, // wrap A7A5 → wA7A5, then wA7A5 → USDT via V3
}

// ── Addresses (fill in for your chain) ─────────────────────────────────────

const ADDR = {
  router: '0x<deployed-A7A5MultiRouter>',
  a7a5: '0x<A7A5>',
  wA7A5: '0x<wA7A5>',
  usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
};

// ── Helper: SecondHop struct for a V3 pool ──────────────────────────────────

function v3SecondHop(tokenOut: string, minOut: bigint, fee: number) {
  return {
    tokenOut,
    amountOutMinimum: minOut,
    useV4: false,
    v3Fee: fee,
    v4Fee: 0,
    v4TickSpacing: 0,
    v4Hooks: ethers.ZeroAddress,
  };
}

// ── Helper: SecondHop struct for a V4 pool ──────────────────────────────────

function v4SecondHop(tokenOut: string, minOut: bigint, fee: number, tickSpacing: number, hooks = ethers.ZeroAddress) {
  return {
    tokenOut,
    amountOutMinimum: minOut,
    useV4: true,
    v3Fee: 0,
    v4Fee: fee,
    v4TickSpacing: tickSpacing,
    v4Hooks: hooks,
  };
}

// ── Swap with automatic best-path selection ─────────────────────────────────

async function swapA7A5ToBestPath(
  signer: ethers.Signer,
  a7a5AmountIn: bigint,
  tokenOut: string,
  v3SecondFee: number, // V3 fee for USDT/tokenOut pool
  slippageBps: number, // e.g. 50 = 0.5%
) {
  const provider = signer.provider!;
  const userAddr = await signer.getAddress();
  const router = new ethers.Contract(ADDR.router, ROUTER_ABI, signer);

  // ── 1. Quote both paths and pick the better one ──────────────────────────
  const [bestPath, bestUSDT, bestFinalOut] = await router.getBestA7A5Route.staticCall(a7a5AmountIn, v3SecondFee, tokenOut);

  console.log('Best first-hop path:', bestPath === 0n ? 'V2 direct' : 'V3 wrapped');
  console.log('Expected USDT mid:', ethers.formatUnits(bestUSDT, 6));
  console.log('Expected output:', ethers.formatUnits(bestFinalOut, 18));

  const minUSDT = (bestUSDT * BigInt(10000 - slippageBps)) / 10000n;
  const minFinalOut = (bestFinalOut * BigInt(10000 - slippageBps)) / 10000n;

  // ── 2. Approve A7A5 to router ────────────────────────────────────────────
  const a7a5 = new ethers.Contract(ADDR.a7a5, ERC20_ABI, signer);
  if ((await a7a5.allowance(userAddr, ADDR.router)) < a7a5AmountIn) {
    await (await a7a5.approve(ADDR.router, MaxUint256)).wait();
    console.log('A7A5 approved');
  }

  // ── 3. Execute swap ──────────────────────────────────────────────────────
  const deadline = Math.floor(Date.now() / 1000) + 1800;
  const hop2 = v3SecondHop(tokenOut, minFinalOut, v3SecondFee);

  const tx = await router.swapA7A5ForToken(a7a5AmountIn, minUSDT, Number(bestPath), hop2, deadline);
  const receipt = await tx.wait();
  console.log('Swap confirmed:', receipt.hash);
  return receipt;
}

// ── Example: force V2 path for first hop ───────────────────────────────────

async function swapA7A5ViaV2(signer: ethers.Signer, a7a5AmountIn: bigint, tokenOut: string, v3SecondFee: number, slippageBps: number) {
  const router = new ethers.Contract(ADDR.router, ROUTER_ABI, signer);

  // Quote specifically for V2 first-hop
  const [usdtMid, estimatedOut] = await router.quoteA7A5ForToken.staticCall(
    a7a5AmountIn,
    FirstHopPath.A7A5_V2,
    v3SecondHop(tokenOut, 0n, v3SecondFee),
  );

  const minUSDT = (usdtMid * BigInt(10000 - slippageBps)) / 10000n;
  const minOut = (estimatedOut * BigInt(10000 - slippageBps)) / 10000n;

  const deadline = Math.floor(Date.now() / 1000) + 1800;
  const hop2 = v3SecondHop(tokenOut, minOut, v3SecondFee);

  return router.swapA7A5ForToken(a7a5AmountIn, minUSDT, FirstHopPath.A7A5_V2, hop2, deadline);
}

// ── Example: second hop via V4 pool ────────────────────────────────────────

async function swapA7A5ToV4Target(signer: ethers.Signer, a7a5In: bigint, tokenOut: string, v4Fee: number, v4Spacing: number, slippageBps: number) {
  const router = new ethers.Contract(ADDR.router, ROUTER_ABI, signer);

  // Build V4 second hop
  const hop2 = v4SecondHop(tokenOut, 0n, v4Fee, v4Spacing);

  // Quote (V2 first hop + V4 second hop)
  const [usdtMid, estimated] = await router.quoteA7A5ForToken.staticCall(a7a5In, FirstHopPath.A7A5_V2, {
    ...hop2,
    amountOutMinimum: 0n,
  });

  hop2.amountOutMinimum = (estimated * BigInt(10000 - slippageBps)) / 10000n;
  const minUSDT = (usdtMid * BigInt(10000 - slippageBps)) / 10000n;

  const deadline = Math.floor(Date.now() / 1000) + 1800;
  return router.swapA7A5ForToken(a7a5In, minUSDT, FirstHopPath.A7A5_V2, hop2, deadline);
}

export {swapA7A5ToBestPath, swapA7A5ViaV2, swapA7A5ToV4Target, FirstHopPath};
