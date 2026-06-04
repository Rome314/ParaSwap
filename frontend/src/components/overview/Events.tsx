import { mainnet, tron } from 'viem/chains';
import { useEvents } from '../../hooks/useEvents';
import { useLang } from '../../i18n';
import type { TaggedEvent } from '../../types/api';
import { ChainEventItem } from '../ui/Events';
import { Btn, SectionTitle } from '../ui/ui';

type EventsQuery = ReturnType<typeof useEvents>;

type Props = { ethEvents: EventsQuery; tronEvents: EventsQuery };

export function RecentEventsSection({ ethEvents, tronEvents }: Props) {
  const { t } = useLang();

  const isFetching = ethEvents.isFetching || tronEvents.isFetching;
  const isError = ethEvents.isError || tronEvents.isError;
  const hasData = !!ethEvents.data || !!tronEvents.data;

  const merged: TaggedEvent[] = [
    ...(ethEvents.data ?? []).map((e) => ({ ...e, chainId: mainnet.id })),
    ...(tronEvents.data ?? []).map((e) => ({ ...e, chainId: tron.id })),
  ].sort((a, b) => b.blockNumber - a.blockNumber);

  function refetchAll() {
    ethEvents.refetch();
    tronEvents.refetch();
  }

  return (
    <div>
      <SectionTitle>{t.overview.recentEvents}</SectionTitle>
      <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[11px] text-muted">
            {t.overview.eventsNote} <span className="text-accent/70">{t.overview.eventsNote2}</span>
          </div>
          <Btn
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={isFetching}
            className="ml-4 shrink-0"
          >
            {isFetching
              ? t.overview.fetchingEvents
              : hasData
                ? t.overview.refreshEventsBtn
                : t.overview.fetchEventsBtn}
          </Btn>
        </div>
        {isFetching && (
          <div className="py-4 text-center font-mono text-xs text-muted">
            {t.overview.fetchingEvents}
          </div>
        )}
        {!isFetching && isError && (
          <div className="py-4 text-center font-mono text-xs text-accent3">
            {t.overview.eventsError}
          </div>
        )}
        {!isFetching && !hasData && !isError && (
          <div className="py-4 text-center font-mono text-xs text-muted">
            {t.overview.eventsNotFetched}
          </div>
        )}
        {!isFetching && hasData && merged.length === 0 && (
          <div className="py-4 text-center font-mono text-xs text-muted">{t.overview.noEvents}</div>
        )}
        {merged.length > 0 && (
          <div className="max-h-[420px] overflow-y-auto">
            {merged.map((ev, i) => (
              <ChainEventItem key={i} ev={ev} chainId={ev.chainId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
