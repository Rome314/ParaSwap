// Fork diagnostics: verifies whale balances and investigates whether a Uniswap
// V4 wA7A5/USDT pool exists (the router is built for V4, the frontend uses V3).
//
//   ALCHEMY_API_KEY=... npx hardhat run scripts/diagnose-fork.ts
import {network} from 'hardhat';
import {ADDRESSES} from '../common/addresses.js';

const conn = await network.create('hardhat');
const {ethers} = conn;

const ERC20 = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];

function fmt(v: bigint, d = 6) {
  return ethers.formatUnits(v, d);
}

async function main() {
  // #region agent log
  fetch('http://127.0.0.1:7723/ingest/91286a68-cbca-4c42-a1c4-fd2eccc0dee1', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Debug-Session-Id': '021ce4'},
    body: JSON.stringify({
      sessionId: '021ce4',
      runId: 'post-fix',
      hypothesisId: 'B',
      location: 'diagnose-fork.ts:main',
      message: 'diagnose-fork script started',
      data: {network: 'hardhat'},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const net = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlockNumber();
  console.log(`\nFork: chainId=${net.chainId} block=${block}\n`);

  // ── 1. Whale balances ──────────────────────────────────────────────────────
  const checks: Array<[string, string, string]> = [
    ['A7A5_WHALE holds A7A5', ADDRESSES.A7A5, ADDRESSES.A7A5_WHALE],
    ['WA7A5_WHALE holds WA7A5', ADDRESSES.WA7A5, ADDRESSES.WA7A5_WHALE],
    ['USDT_WHALE holds USDT', ADDRESSES.USDT, ADDRESSES.USDT_WHALE],
  ];
  console.log('Whale balances:');
  for (const [label, token, holder] of checks) {
    const c = new ethers.Contract(token, ERC20, ethers.provider);
    const bal: bigint = await c.balanceOf(holder);
    console.log(`  ${label.padEnd(26)} ${holder} = ${fmt(bal)} ${bal > 0n ? 'OK' : 'EMPTY ⚠'}`);
  }

  // ── 2. V3 pool sanity (frontend's wA7A5/USDT route) ─────────────────────────
  const v3code = await ethers.provider.getCode(ADDRESSES.V3_POOL_USDT_WA7A5);
  const wa7a5InV3: bigint = await new ethers.Contract(ADDRESSES.WA7A5, ERC20, ethers.provider).balanceOf(ADDRESSES.V3_POOL_USDT_WA7A5);
  console.log(`\nV3 pool ${ADDRESSES.V3_POOL_USDT_WA7A5}: code=${v3code !== '0x'} wA7A5=${fmt(wa7a5InV3)}`);

  // ── 3. V4 pool investigation: ask the V4 Quoter for wA7A5 → USDT ────────────
  // PoolKey: currency0 < currency1, with the common fee/tickSpacing combos.
  const [c0, c1] = BigInt(ADDRESSES.WA7A5) < BigInt(ADDRESSES.USDT) ? [ADDRESSES.WA7A5, ADDRESSES.USDT] : [ADDRESSES.USDT, ADDRESSES.WA7A5];
  const zeroForOne = c0.toLowerCase() === ADDRESSES.WA7A5.toLowerCase();
  const QUOTER_ABI = [
    'function quoteExactInputSingle((( address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
  ];
  const quoter = new ethers.Contract(ADDRESSES.V4_QUOTER, QUOTER_ABI, ethers.provider);
  const combos: Array<[number, number]> = [
    [500, 10],
    [3000, 60],
    [10000, 200],
    [100, 1],
  ];
  console.log(`\nV4 Quoter ${ADDRESSES.V4_QUOTER} — wA7A5→USDT probe:`);
  let anyV4 = false;
  for (const [fee, tickSpacing] of combos) {
    const params = {
      poolKey: {
        currency0: c0,
        currency1: c1,
        fee,
        tickSpacing,
        hooks: ethers.ZeroAddress,
      },
      zeroForOne,
      exactAmount: 1_000_000n, // 1 wA7A5 (6 decimals)
      hookData: '0x',
    };
    try {
      const [amountOut] = await quoter.quoteExactInputSingle.staticCall(params);
      console.log(`  fee=${fee} tick=${tickSpacing}: amountOut=${fmt(amountOut)} USDT  ${amountOut > 0n ? 'POOL EXISTS ✅' : 'zero'}`);
      if (amountOut > 0n) anyV4 = true;
    } catch (e: any) {
      console.log(`  fee=${fee} tick=${tickSpacing}: no pool / revert (${(e.shortMessage ?? e.message ?? '').slice(0, 60)})`);
    }
  }
  console.log(
    `\nConclusion: V4 wA7A5/USDT pool ${anyV4 ? 'EXISTS — router V4 paths are testable' : 'NOT FOUND — live route is V3; router V4 paths (B/C) are not executable on this fork'}.\n`,
  );
}

await main();
