import { shortAddr, fmt } from '../../lib/helpers';
import type { ContractEvent } from '../../types/api';
import { mainnet, tron } from 'viem/chains';

const EVENT_META: Record<string, { icon: string; color: string }> = {
  Issue: { icon: '🪙', color: 'bg-accent/10' },
  Burn: { icon: '🔥', color: 'bg-accent3/10' },
  Blacklisted: { icon: '🚫', color: 'bg-accent3/15' },
  DeBlacklisted: { icon: '✅', color: 'bg-accent2/10' },
  DestroyedBlackFunds: { icon: '💣', color: 'bg-accent3/10' },
  TotalLiquidityUpdated: { icon: '📈', color: 'bg-purple-500/10' },
  Paused: { icon: '⏸', color: 'bg-accent/10' },
  Unpaused: { icon: '▶', color: 'bg-accent2/10' },
  BasisPointsRateUpdated: { icon: '⚙️', color: 'bg-blue-400/10' },
};

const CHAIN_ICON: Record<number, string> = {
  [mainnet.id]: '⟠',
  [tron.id]: '◈',
};

export function ChainEventItem({ ev, chainId }: { ev: ContractEvent; chainId?: number }) {
  const meta = EVENT_META[ev.name] ?? { icon: '🔔', color: 'bg-surface2' };
  const chainIcon = chainId !== undefined ? (CHAIN_ICON[chainId] ?? '') : '';
  const detail = Object.entries(ev.args)
    .map(([k, v]) => {
      const num = BigInt(v);
      const isAddr = v.startsWith('0x') && v.length === 42;
      if (isAddr) return `${k}: ${shortAddr(v)}`;
      if (num > 0n) return `${k}: ${fmt(Number(num) / 1_000_000)}`;
      return `${k}: ${v}`;
    })
    .join(' · ');

  return (
    <div className="mb-1 flex items-start gap-3.5 rounded-lg p-3 transition-colors hover:bg-white/[0.02]">
      <div
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-sm ${meta.color}`}
      >
        {meta.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[13px] font-bold">{ev.name}</div>
        <div className="truncate font-mono text-[11px] leading-relaxed text-muted">
          {detail || '—'}
        </div>
      </div>
      <div className="shrink-0 pt-0.5 text-right font-mono text-[10px] text-muted">
        {chainIcon && <span className="mr-1">{chainIcon}</span>}#{ev.blockNumber}
      </div>
    </div>
  );
}
