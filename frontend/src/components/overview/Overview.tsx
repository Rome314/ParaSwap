import { Btn } from '../ui/ui';
import { fmtRaw } from '../../lib/helpers';
import { useLang } from '../../i18n';
import { useChain } from '../../hooks/useChain';
import { useProtocolState } from '../../hooks/useProtocolState';
import { useEvents } from '../../hooks/useEvents';
import { mainnet, tron } from 'viem/chains';
import { ChainStats } from './Stats';
import { ChainAddressesSection } from './Addresses';
import { RecentEventsSection } from './Events';

export function ProtocolOverview() {
  const { t } = useLang();
  const ethChain = useChain(mainnet.id);
  const tronChain = useChain(tron.id);

  const ethStats = useProtocolState(ethChain.chainId, ethChain.addresses);
  const tronStats = useProtocolState(tronChain.chainId, tronChain.addresses);
  const ethEvents = useEvents(ethChain.chainId, ethChain.addresses);
  const tronEvents = useEvents(tronChain.chainId, tronChain.addresses);

  const ethLiq = ethStats.data?.totalLiquidity ?? '0';
  const tronLiq = tronStats.data?.totalLiquidity ?? '0';
  const combinedLiq = (BigInt(ethLiq) + BigInt(tronLiq)).toString();
  const isFetchingAny = ethStats.isFetching || tronStats.isFetching;
  const hasAnyData = !!ethStats.data || !!tronStats.data;

  function fetchAll() {
    ethStats.refetch();
    tronStats.refetch();
  }

  return (
    <div className="space-y-6">
      {/* Combined summary */}
      <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 font-mono text-[11px] tracking-[2px] text-muted uppercase">
              {t.overview.totalLiquidity} — All Chains
            </div>
            <div className="font-mono text-2xl text-accent">
              {hasAnyData ? fmtRaw(combinedLiq) : '—'}
            </div>
          </div>
          <Btn
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={isFetchingAny}
            className="shrink-0 tracking-normal normal-case"
          >
            {isFetchingAny
              ? t.overview.fetchingStats
              : hasAnyData
                ? t.overview.refreshStatsBtn
                : t.overview.fetchStatsBtn}
          </Btn>
        </div>
      </div>

      {/* Per-chain columns */}
      <div className="grid grid-cols-2 gap-6">
        {/* ETH */}
        <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
          <div className="mb-4 font-mono text-[11px] tracking-[2px] text-muted uppercase">
            ⟠ {t.overview.evmStats}
          </div>
          {ethStats.isFetching && (
            <div className="py-4 text-center font-mono text-xs text-muted">
              {t.overview.fetchingStats}
            </div>
          )}
          {!ethStats.isFetching && ethStats.isError && (
            <div className="py-2 font-mono text-xs text-accent3">
              ⚠ ETH: {(ethStats.error as Error)?.message ?? 'failed'}
            </div>
          )}
          {!ethStats.isFetching && !ethStats.data && !ethStats.isError && (
            <div className="py-4 text-center font-mono text-xs text-muted">
              {t.overview.statsNotFetched}
            </div>
          )}
          {!ethStats.isFetching && ethStats.data && (
            <ChainStats state={ethStats.data} networkLabel="ETH" />
          )}
          {ethChain.supported && (
            <ChainAddressesSection chainId={ethChain.chainId} addresses={ethChain.addresses} />
          )}
        </div>

        {/* TRON */}
        <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
          <div className="mb-4 font-mono text-[11px] tracking-[2px] text-muted uppercase">
            ◈ {t.overview.tronStats}
          </div>
          {tronStats.isFetching && (
            <div className="py-4 text-center font-mono text-xs text-muted">
              {t.overview.fetchingStats}
            </div>
          )}
          {!tronStats.isFetching && tronStats.isError && (
            <div className="py-2 font-mono text-xs text-accent3">
              ⚠ TRON: {(tronStats.error as Error)?.message ?? 'failed'}
            </div>
          )}
          {!tronStats.isFetching && !tronStats.data && !tronStats.isError && (
            <div className="py-4 text-center font-mono text-xs text-muted">
              {t.overview.statsNotFetched}
            </div>
          )}
          {!tronStats.isFetching && tronStats.data && (
            <ChainStats state={tronStats.data} networkLabel="TRON" />
          )}
          {tronChain.supported && (
            <ChainAddressesSection chainId={tronChain.chainId} addresses={tronChain.addresses} />
          )}
        </div>
      </div>

      <RecentEventsSection ethEvents={ethEvents} tronEvents={tronEvents} />
    </div>
  );
}
