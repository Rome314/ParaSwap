import { useLang } from '../../i18n';
import { fmtRaw } from '../../lib/helpers';
import { ProtocolState } from '../../types/api';
import { StatCard } from '../ui/Cards';

type ChainStatsProps = { state: ProtocolState; networkLabel: string };

export function ChainStats({ state, networkLabel }: ChainStatsProps) {
  const { t } = useLang();
  const basisPoints = Number(state.basisPointsRate ?? '0');
  const paused = state.paused ?? false;

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <StatCard
            label={t.overview.totalLiquidity}
            value={fmtRaw(state.totalLiquidity)}
            sub={t.overview.totalLiquiditySub}
            color="text-accent"
            tip={t.overview.totalLiquidityTip}
          />
        </div>
        <StatCard
          label={t.overview.yieldApr}
          value="TO BE FETCHED"
          sub={t.overview.yieldAprSub}
          color="text-accent2"
          tip={t.overview.yieldAprTip}
        />
        <StatCard
          label={t.overview.transferFee}
          value={`${basisPoints} bp`}
          sub={t.overview.transferFeeSub}
          tip={t.overview.transferFeeTip}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            paused ? 'bg-accent3 shadow-[0_0_6px_#e85447]' : 'bg-accent2 shadow-[0_0_6px_#4fd1a5]'
          }`}
        />
        <span className="font-mono text-[11px] text-muted">
          {networkLabel} — {paused ? t.overview.pausedBadge : t.overview.liveBadge}
        </span>
      </div>
    </div>
  );
}
