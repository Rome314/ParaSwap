import { BrowserProvider, Contract, JsonRpcSigner, MaxUint256, type Signer } from 'ethers';
import { getWalletClient } from 'wagmi/actions';
import { wagmiConfig } from '../../config/wagmi';
import { PERMIT2_ABI } from '../../lib/abis';
import { ERC20_ABI } from '../../lib/a7a5/abis';
import type { Addresses } from '../../config/addresses';

// ── Types ────────────────────────────────────────────────────────────────────

export type Side = 'A7A5' | 'wA7A5';
export type Direction = 'sell' | 'buy'; // sell = side→USDT, buy = USDT→side

export type RoutingMethodParameters = { calldata: string; value: string; to: string };
export type RoutingApiResponse = {
  quote?: string;
  methodParameters?: RoutingMethodParameters;
};

// ── Constants ────────────────────────────────────────────────────────────────

export const SLIPPAGE_BPS = 50n; // 0.5 %
export const PERMIT2_MAX_UINT160 = (1n << 160n) - 1n;
export const PERMIT2_EXPIRY_SEC = 60 * 60 * 24 * 30; // 30 days

// ── Wallet helpers ───────────────────────────────────────────────────────────

export async function getSigner(): Promise<Signer> {
  const wc = await getWalletClient(wagmiConfig);
  if (!wc) throw new Error('No wallet connected');
  const provider = new BrowserProvider(wc.transport, { chainId: wc.chain.id, name: wc.chain.name });
  return new JsonRpcSigner(provider, wc.account.address);
}

// ── Permit2 flow ─────────────────────────────────────────────────────────────

export type Permit2Step = 'erc20-approve' | 'permit2-approve' | 'ready';

/**
 * Ensure (token → Permit2) and (Permit2 → Universal Router) allowances cover
 * `amount` for the connected user. Calls `onStep` to surface progress.
 */
export async function ensurePermit2(
  signer: Signer,
  user: string,
  tokenIn: string,
  amount: bigint,
  addresses: Addresses,
  onStep?: (step: Permit2Step) => void
): Promise<void> {
  if (!addresses.UNISWAP) throw new Error('Uniswap addresses missing on this chain');
  const { PERMIT2, UNIVERSAL_ROUTER } = addresses.UNISWAP;

  // Step 1: token → Permit2
  const token = new Contract(tokenIn, ERC20_ABI, signer);
  const onPermit2: bigint = await token.allowance(user, PERMIT2);
  if (onPermit2 < amount) {
    onStep?.('erc20-approve');
    await (await token.approve(PERMIT2, MaxUint256)).wait();
  }

  // Step 2: Permit2 → Universal Router
  const permit2 = new Contract(PERMIT2, PERMIT2_ABI, signer);
  const [allowedAmount, expiration]: [bigint, number] = await permit2.allowance(
    user,
    tokenIn,
    UNIVERSAL_ROUTER
  );
  const nowSec = Math.floor(Date.now() / 1000);
  if (allowedAmount < amount || expiration < nowSec) {
    onStep?.('permit2-approve');
    await (
      await permit2.approve(
        tokenIn,
        UNIVERSAL_ROUTER,
        PERMIT2_MAX_UINT160,
        nowSec + PERMIT2_EXPIRY_SEC
      )
    ).wait();
  }
  onStep?.('ready');
}

// ── Routing API client ───────────────────────────────────────────────────────

export type RoutingQuoteParams = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: bigint; // raw amount (input token's smallest unit)
  swapper: string;
  slippageBps: number;
  protocols?: ('V2' | 'V3' | 'V4' | 'MIXED')[];
};

export async function fetchRoutingQuote(p: RoutingQuoteParams): Promise<RoutingApiResponse> {
  const res = await fetch('/api/uniswap-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      tokenInChainId: p.chainId,
      tokenIn: p.tokenIn,
      tokenOutChainId: p.chainId,
      tokenOut: p.tokenOut,
      amount: p.amount.toString(),
      type: 'EXACT_INPUT',
      swapper: p.swapper,
      slippageTolerance: p.slippageBps,
      ...(p.protocols ? { protocols: p.protocols } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Routing API ${res.status}: ${await res.text()}`);
  return (await res.json()) as RoutingApiResponse;
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Apply `bps` basis-point slippage as a downside (round down). */
export function applySlippage(amount: bigint, slippageBps: bigint = SLIPPAGE_BPS): bigint {
  return amount - (amount * slippageBps) / 10000n;
}

/** Pick the input/output token addresses for a Pair-mode swap. */
export function pairTokens(
  side: Side,
  direction: Direction,
  addresses: Addresses
): { tokenIn: string; tokenOut: string; protocol: 'V2' | 'V3' } {
  const a7a5 = addresses.A7A5.A7A5;
  const wa7a5 = addresses.A7A5.WA7A5;
  if (!wa7a5) throw new Error('wA7A5 address missing on this chain');
  const usdt = addresses.USDT;

  if (side === 'A7A5') {
    return direction === 'sell'
      ? { tokenIn: a7a5, tokenOut: usdt, protocol: 'V2' }
      : { tokenIn: usdt, tokenOut: a7a5, protocol: 'V2' };
  }
  return direction === 'sell'
    ? { tokenIn: wa7a5, tokenOut: usdt, protocol: 'V3' }
    : { tokenIn: usdt, tokenOut: wa7a5, protocol: 'V3' };
}
