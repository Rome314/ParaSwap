import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits, parseUnits } from 'ethers';
import { useBalances } from '../../hooks/useBalances';
import { buildPairSwapCalldata, getQuote, type QuoteResult } from '../../lib/quote';
import type { Addresses } from '../../config/addresses';
import { isSupportedChainId, SUPPORTED_CHAINS } from '../../config/chains';
import { useLang } from '../../i18n';
import { Btn, Inp } from '../ui/ui';
import {
  applySlippage,
  ensurePermit2,
  getSigner,
  pairTokens,
  SLIPPAGE_BPS,
  type Direction,
  type Side,
} from './shared';

type Props = { chainId: number; addresses: Addresses };

export function PairSwap({ chainId, addresses }: Props) {
  const { t } = useLang();
  const { address } = useAccount();
  const { data: balances } = useBalances(address, chainId, addresses);
  const fotBps = Number(balances?.a7a5State.basisPointsRate ?? 0);

  const [side, setSide] = useState<Side>('A7A5');
  const [direction, setDirection] = useState<Direction>('sell');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const { tokenIn, protocol } = pairTokens(side, direction, addresses);
  const inSymbol = direction === 'sell' ? side : 'USDT';
  const outSymbol = direction === 'sell' ? 'USDT' : side;

  const poolAddr =
    side === 'A7A5'
      ? addresses.A7A5.V2_PAIR_USDT_A7A5
      : addresses.A7A5.V3_POOL_USDT_WA7A5;

  const explorerHref =
    poolAddr && isSupportedChainId(chainId)
      ? SUPPORTED_CHAINS[chainId].explorerURL(`address/${poolAddr}`)
      : undefined;

  function resetQuote() {
    setQuote(null);
    setStatus(null);
  }

  async function handleQuote() {
    if (!address) return setStatus({ ok: false, msg: t.swap.connectFirst });
    if (!amount) return setStatus({ ok: false, msg: t.swap.needAmount });
    setBusy(true);
    setStatus({ ok: true, msg: t.swap.computing });
    try {
      const amountIn = parseUnits(amount, 6);
      const result = await getQuote(side, amountIn, chainId, addresses, fotBps, direction);
      setQuote(result);
      setStatus(null);
    } catch (e) {
      setQuote(null);
      setStatus({ ok: false, msg: `${t.swap.quoteFailed}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleSwap() {
    if (!address || !quote) return;
    setBusy(true);
    setStatus({ ok: true, msg: t.swap.computing });
    try {
      const units = parseUnits(amount, 6);
      const amountOutMin = applySlippage(quote.amountOut);

      const signer = await getSigner();
      await ensurePermit2(signer, address, tokenIn, units, addresses, (step) => {
        if (step === 'erc20-approve') setStatus({ ok: true, msg: t.swap.approvingErc20 });
        else if (step === 'permit2-approve') setStatus({ ok: true, msg: t.swap.approvingPermit2 });
      });

      setStatus({ ok: true, msg: t.swap.fetchingCalldata });
      const { calldata, value, to } = await buildPairSwapCalldata(
        side,
        units,
        chainId,
        addresses,
        address,
        Number(SLIPPAGE_BPS),
        direction,
        fotBps,
      );

      setStatus({ ok: true, msg: t.swap.executing });
      const receipt = await (
        await signer.sendTransaction({ to, data: calldata, value: BigInt(value ?? '0') })
      ).wait();

      setStatus({
        ok: true,
        msg:
          (receipt?.blockNumber ? t.swap.minedIn(receipt.blockNumber) : t.swap.minedIn(0)) +
          ` ${t.swap.minReceived}: ${formatUnits(amountOutMin, 6)} ${outSymbol}.`,
      });
      setQuote(null);
    } catch (e) {
      setStatus({ ok: false, msg: `${t.swap.swapFailed}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Controls: token selector · direction flip · protocol + pool link */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Token selector */}
        <div className="flex items-center gap-1 rounded-lg border border-rim bg-surface2 p-1">
          {(['A7A5', 'wA7A5'] as Side[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                resetQuote();
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

        {/* Direction flip */}
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-ink">{inSymbol}</span>
          <button
            onClick={() => {
              setDirection((d) => (d === 'sell' ? 'buy' : 'sell'));
              resetQuote();
            }}
            disabled={busy}
            title="Flip direction"
            className="cursor-pointer rounded border border-rim bg-surface2 px-2 py-0.5 text-muted transition-colors hover:border-accent/50 hover:text-ink"
          >
            ⇌
          </button>
          <span className="text-ink">USDT</span>
        </div>

        {/* Protocol badge + pool address link */}
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full border border-rim bg-surface2 px-2.5 py-0.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">
            {protocol}
          </span>
          {poolAddr && explorerHref && (
            <a
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-muted transition-colors hover:text-accent"
            >
              0x{poolAddr.slice(2, 6)}…{poolAddr.slice(-4)} ↗
            </a>
          )}
        </div>
      </div>

      {fotBps > 0 && side === 'A7A5' && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2 font-mono text-[11px] text-accent">
          {t.swap.feeOnTransfer(fotBps)}
        </div>
      )}

      {/* Amount input */}
      <div>
        <div className="mb-1.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">
          {t.swap.sellLabel} — {inSymbol}
        </div>
        <Inp
          inputMode="decimal"
          placeholder={t.swap.amountPlaceholder}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            resetQuote();
          }}
          disabled={busy}
        />
      </div>

      {/* Quote summary */}
      {quote && (
        <div className="rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-[2]">
          <span className="text-muted">{t.swap.estimatedOut}:</span>{' '}
          <span className="text-accent">
            {quote.amountOutFormatted} {outSymbol}
          </span>
          <br />
          <span className="text-muted">{t.swap.priceImpact}:</span>{' '}
          <span className="text-ink">{quote.priceImpact}</span>
          <br />
          <span className="text-muted">{t.swap.slippage}:</span>{' '}
          <span className="text-ink">{(Number(SLIPPAGE_BPS) / 100).toFixed(2)}%</span>
        </div>
      )}

      {/* Status message */}
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

      {/* Actions */}
      <div className="flex gap-2">
        <Btn variant="outline" onClick={handleQuote} disabled={busy || !amount || !address}>
          {t.swap.getQuoteBtn}
        </Btn>
        <Btn variant="primary" onClick={handleSwap} disabled={busy || !quote || !address}>
          {t.swap.swapBtn}
        </Btn>
      </div>
    </div>
  );
}
