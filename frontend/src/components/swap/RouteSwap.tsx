import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits, isAddress, parseUnits } from 'ethers';
import { useBalances } from '../../hooks/useBalances';
import { getQuote } from '../../lib/quote';
import type { Addresses } from '../../config/addresses';
import { useLang } from '../../i18n';
import { Btn, Inp } from '../ui/ui';
import {
  applySlippage,
  ensurePermit2,
  fetchRoutingQuote,
  getSigner,
  pairTokens,
  SLIPPAGE_BPS,
  type Side,
} from './shared';
import { TokenPicker } from './TokenPicker';

type Props = { chainId: number; addresses: Addresses };

type Leg1Quote = {
  amountOut: bigint;
  amountOutFormatted: string;
  protocol: 'V2' | 'V3';
  priceImpact: string;
};
type Leg2Quote = { amountOut: bigint; amountOutFormatted: string };

type LegStage = 'idle' | 'leg1-done' | 'all-done';

/**
 * A7A5/wA7A5 → USDT → arbitrary ERC-20.
 *
 * Two on-chain transactions: leg 1 routed by the local SDK (V2/V3 protocol
 * pool), leg 2 routed by the Uniswap Routing API for best execution. The
 * intermediate USDT lands in the user's wallet between legs.
 */
export function RouteSwap({ chainId, addresses }: Props) {
  const { t } = useLang();
  const { address } = useAccount();
  const { data: balances } = useBalances(address, chainId, addresses);
  const fotBps = Number(balances?.a7a5State.basisPointsRate ?? 0);

  const [side, setSide] = useState<Side>('A7A5');
  const [amount, setAmount] = useState('');
  const [outToken, setOutToken] = useState('');

  const [leg1, setLeg1] = useState<Leg1Quote | null>(null);
  const [leg2, setLeg2] = useState<Leg2Quote | null>(null);
  const [stage, setStage] = useState<LegStage>('idle');
  const [usdtFromLeg1, setUsdtFromLeg1] = useState<bigint | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  function resetAll() {
    setLeg1(null);
    setLeg2(null);
    setStage('idle');
    setUsdtFromLeg1(null);
    setStatus(null);
  }

  const outTokenValid = isAddress(outToken.trim());

  async function handleQuote() {
    if (!address) return setStatus({ ok: false, msg: t.swap.connectFirst });
    if (!amount) return setStatus({ ok: false, msg: t.swap.needAmount });
    if (!outTokenValid) return setStatus({ ok: false, msg: t.swap.needAddr });

    setBusy(true);
    setStatus({ ok: true, msg: t.swap.computing });
    try {
      const amountIn = parseUnits(amount, 6);

      // Leg 1: A7A5/wA7A5 → USDT (local SDK math).
      const leg1Result = await getQuote(side, amountIn, chainId, addresses, fotBps, 'sell');

      // Leg 2: USDT → outToken via Routing API. swapper required for quote.
      const routing = await fetchRoutingQuote({
        chainId,
        tokenIn: addresses.USDT,
        tokenOut: outToken.trim(),
        amount: leg1Result.amountOut,
        swapper: address,
        slippageBps: Number(SLIPPAGE_BPS),
      });
      if (!routing.quote) throw new Error(t.swap.routingNoCalldata);

      const out2 = BigInt(routing.quote);
      setLeg1({
        amountOut: leg1Result.amountOut,
        amountOutFormatted: leg1Result.amountOutFormatted,
        protocol: leg1Result.protocol,
        priceImpact: leg1Result.priceImpact,
      });
      setLeg2({ amountOut: out2, amountOutFormatted: (Number(out2) / 1e6).toFixed(6) });
      setStage('idle');
      setUsdtFromLeg1(null);
      setStatus(null);
    } catch (e) {
      setLeg1(null);
      setLeg2(null);
      setStatus({ ok: false, msg: `${t.swap.quoteFailed}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function runLeg1() {
    if (!address || !leg1) return;
    setBusy(true);
    setStatus({ ok: true, msg: t.swap.computing });
    try {
      const units = parseUnits(amount, 6);
      const { tokenIn, tokenOut, protocol } = pairTokens(side, 'sell', addresses);

      const signer = await getSigner();
      await ensurePermit2(signer, address, tokenIn, units, addresses, (step) => {
        if (step === 'erc20-approve') setStatus({ ok: true, msg: t.swap.approvingErc20 });
        else if (step === 'permit2-approve') setStatus({ ok: true, msg: t.swap.approvingPermit2 });
      });

      setStatus({ ok: true, msg: t.swap.fetchingCalldata });
      const routing = await fetchRoutingQuote({
        chainId,
        tokenIn,
        tokenOut,
        amount: units,
        swapper: address,
        slippageBps: Number(SLIPPAGE_BPS),
        protocols: [protocol],
      });
      if (!routing.methodParameters) throw new Error(t.swap.routingNoCalldata);

      setStatus({ ok: true, msg: t.swap.executing });
      const { to, calldata, value } = routing.methodParameters;
      await (await signer.sendTransaction({ to, data: calldata, value: BigInt(value ?? '0') })).wait();

      // Use the Routing API quote (in raw USDT) as the leg-2 input amount —
      // it reflects the actual on-chain output more accurately than the SDK
      // estimate did. Fall back to leg1.amountOut if the routing quote was
      // unavailable.
      const usdtOut = routing.quote ? BigInt(routing.quote) : leg1.amountOut;
      setUsdtFromLeg1(usdtOut);
      setStage('leg1-done');
      setStatus({ ok: true, msg: t.swap.leg1Done });
    } catch (e) {
      setStatus({ ok: false, msg: `${t.swap.swapFailed}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function runLeg2() {
    if (!address || !usdtFromLeg1 || !outTokenValid) return;
    setBusy(true);
    setStatus({ ok: true, msg: t.swap.computing });
    try {
      const signer = await getSigner();
      await ensurePermit2(signer, address, addresses.USDT, usdtFromLeg1, addresses, (step) => {
        if (step === 'erc20-approve') setStatus({ ok: true, msg: t.swap.approvingErc20 });
        else if (step === 'permit2-approve') setStatus({ ok: true, msg: t.swap.approvingPermit2 });
      });

      setStatus({ ok: true, msg: t.swap.fetchingCalldata });
      const routing = await fetchRoutingQuote({
        chainId,
        tokenIn: addresses.USDT,
        tokenOut: outToken.trim(),
        amount: usdtFromLeg1,
        swapper: address,
        slippageBps: Number(SLIPPAGE_BPS),
      });
      if (!routing.methodParameters) throw new Error(t.swap.routingNoCalldata);

      setStatus({ ok: true, msg: t.swap.executing });
      const { to, calldata, value } = routing.methodParameters;
      const receipt = await (
        await signer.sendTransaction({ to, data: calldata, value: BigInt(value ?? '0') })
      ).wait();

      const minOut = leg2 ? applySlippage(leg2.amountOut) : 0n;
      setStage('all-done');
      setStatus({
        ok: true,
        msg:
          (receipt?.blockNumber ? t.swap.minedIn(receipt.blockNumber) : t.swap.minedIn(0)) +
          ` ${t.swap.minReceived}: ${formatUnits(minOut, 6)} (6-dec).`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: `${t.swap.swapFailed}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Side picker (input token is always A7A5 or wA7A5) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-rim bg-surface2 p-1">
          {(['A7A5', 'wA7A5'] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                resetAll();
              }}
              disabled={busy}
              className={`cursor-pointer rounded-md border-none px-3.5 py-1.5 font-mono text-xs font-bold transition-all ${
                side === s ? 'bg-accent text-black' : 'bg-transparent text-muted hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto rounded-full border border-rim bg-surface2 px-2.5 py-0.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">
          {side} → USDT → ?
        </span>
      </div>

      {fotBps > 0 && side === 'A7A5' && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2 font-mono text-[11px] text-accent">
          {t.swap.feeOnTransfer(fotBps)}
        </div>
      )}

      {/* Amount in */}
      <div>
        <div className="mb-1.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">
          {t.swap.sellLabel} — {side}
        </div>
        <Inp
          inputMode="decimal"
          placeholder={t.swap.amountPlaceholder}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            resetAll();
          }}
          disabled={busy}
        />
      </div>

      {/* Output token */}
      <TokenPicker
        value={outToken}
        onChange={(v) => {
          setOutToken(v);
          resetAll();
        }}
        disabled={busy}
      />

      {/* Two-leg breakdown */}
      {leg1 && leg2 && (
        <div className="grid gap-2">
          <div className="rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-[2]">
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] tracking-[1px] text-accent uppercase">
              {t.swap.leg1}
            </span>{' '}
            <span className="text-muted">
              {side} → USDT ({leg1.protocol})
            </span>
            <br />
            <span className="text-muted">{t.swap.estimatedOut}:</span>{' '}
            <span className="text-accent">{leg1.amountOutFormatted} USDT</span>
            <br />
            <span className="text-muted">{t.swap.priceImpact}:</span>{' '}
            <span className="text-ink">{leg1.priceImpact}</span>
          </div>
          <div className="rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-[2]">
            <span className="rounded bg-accent2/15 px-1.5 py-0.5 text-[10px] tracking-[1px] text-accent2 uppercase">
              {t.swap.leg2}
            </span>{' '}
            <span className="text-muted">USDT → {outToken.slice(0, 6)}…{outToken.slice(-4)}</span>
            <br />
            <span className="text-muted">{t.swap.estimatedOut}:</span>{' '}
            <span className="text-accent2">{leg2.amountOutFormatted} (6-dec)</span>
            <br />
            <span className="text-muted">{t.swap.slippage}:</span>{' '}
            <span className="text-ink">{(Number(SLIPPAGE_BPS) / 100).toFixed(2)}%</span>
          </div>
        </div>
      )}

      {status && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 font-mono text-xs ${
            status.ok
              ? 'border-accent2/30 bg-accent2/10 text-accent2'
              : 'border-accent3/30 bg-accent3/10 text-accent3'
          }`}
        >
          {status.msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Btn
          variant="outline"
          onClick={handleQuote}
          disabled={busy || !amount || !outTokenValid || !address}
        >
          {t.swap.getQuoteBtn}
        </Btn>
        <Btn
          variant="primary"
          onClick={runLeg1}
          disabled={busy || !leg1 || !leg2 || stage !== 'idle'}
        >
          {t.swap.swapLeg1Btn}
        </Btn>
        <Btn
          variant="success"
          onClick={runLeg2}
          disabled={busy || stage !== 'leg1-done' || !usdtFromLeg1}
        >
          {t.swap.swapLeg2Btn}
        </Btn>
      </div>
    </div>
  );
}
