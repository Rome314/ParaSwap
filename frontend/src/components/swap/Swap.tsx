import { useEffect, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import type { Addresses } from '../../config/addresses';
import { useLang } from '../../i18n';
import { SectionTitle } from '../ui/ui';
import { PairSwap } from './PairSwap';
import { RouteSwap } from './RouteSwap';

type Mode = 'pair' | 'route';
type Props = { chainId: number; addresses: Addresses | null };

export function Swap({ chainId, addresses }: Props) {
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>('pair');
  const { chainId: walletChainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  useEffect(() => {
    if (walletChainId && walletChainId !== mainnet.id) {
      switchChain(
        { chainId: mainnet.id },
        { onError: (e) => console.warn('Chain switch declined:', e) },
      );
    }
  }, [walletChainId]);

  if (!addresses || !addresses.UNISWAP) {
    return (
      <div>
        <SectionTitle>{t.swap.title}</SectionTitle>
        <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6">
          {isSwitching ? (
            <>
              <div className="font-mono text-sm font-bold text-accent2">{t.swap.switchingTitle}</div>
              <div className="mt-1 font-mono text-xs text-muted">{t.swap.switchingDesc}</div>
            </>
          ) : (
            <>
              <div className="font-mono text-sm font-bold text-accent3">{t.swap.unavailableTitle}</div>
              <div className="mt-1 font-mono text-xs text-muted">{t.swap.unavailableDesc}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>{t.swap.title}</SectionTitle>
      <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-xs text-muted">{t.swap.subtitle}</div>
          <div className="flex items-center gap-1 rounded-lg border border-rim bg-surface2 p-1">
            {(
              [
                { v: 'pair', label: t.swap.modePair },
                { v: 'route', label: t.swap.modeRoute },
              ] as { v: Mode; label: string }[]
            ).map((m) => (
              <button
                key={m.v}
                onClick={() => setMode(m.v)}
                className={`cursor-pointer rounded-md border-none px-3.5 py-1.5 font-mono text-xs font-bold transition-all ${
                  mode === m.v
                    ? 'bg-accent2 text-black'
                    : 'bg-transparent text-muted hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'pair' ? (
          <PairSwap chainId={chainId} addresses={addresses} />
        ) : (
          <RouteSwap chainId={chainId} addresses={addresses} />
        )}
      </div>
    </div>
  );
}
