import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { aaConfig } from '../../lib/aa/config';
import { env } from '../../config/env';
import { ENTRYPOINT_EXTENDED_ABI, PAYMASTER_ABI, A7A5_NATIVE_ORACLE_ABI } from '../../lib/aa/abis';

export interface DebugEvent {
  id: string;
  source: string;
  name: string;
  blockNumber: number;
  txHash: string;
  args: Record<string, unknown>;
}

const MAX_EVENTS = 30;

export function EventLogPanel() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - 500);
      const fallbackFrom = Math.max(0, latest - 9);
      const collected: DebugEvent[] = [];

      if (aaConfig.entryPoint) {
        const ep = new Contract(aaConfig.entryPoint, ENTRYPOINT_EXTENDED_ABI, provider);
        const logs = await ep
          .queryFilter(ep.filters.UserOperationEvent(), from, latest)
          .catch(() => ep.queryFilter(ep.filters.UserOperationEvent(), fallbackFrom, latest));
        for (const log of logs.slice(-10)) {
          const parsed = ep.interface.parseLog(log);
          if (!parsed) continue;
          collected.push({
            id: `${log.transactionHash}-${log.index}`,
            source: 'EntryPoint',
            name: 'UserOperationEvent',
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            args: { ...parsed.args },
          });
        }
      }

      for (const [label, addr] of [
        ['A7A5 PM', aaConfig.a7a5Paymaster],
        ['USDT PM', aaConfig.usdtPaymaster],
      ] as const) {
        if (!addr) continue;
        const pm = new Contract(addr, PAYMASTER_ABI, provider);
        const deposits = await pm
          .queryFilter(pm.filters.TokenPayment(), from, latest)
          .catch(() => pm.queryFilter(pm.filters.TokenPayment(), fallbackFrom, latest));
        for (const log of deposits.slice(-5)) {
          const parsed = pm.interface.parseLog(log);
          if (!parsed) continue;
          collected.push({
            id: `${log.transactionHash}-${log.index}`,
            source: label,
            name: 'TokenPayment',
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            args: { ...parsed.args },
          });
        }
      }

      if (aaConfig.a7a5NativeOracle) {
        const oracle = new Contract(aaConfig.a7a5NativeOracle, A7A5_NATIVE_ORACLE_ABI, provider);
        const staleness = await oracle
          .queryFilter(oracle.filters.MaxStalenessUpdated(), from, latest)
          .catch(() => oracle.queryFilter(oracle.filters.MaxStalenessUpdated(), fallbackFrom, latest));
        for (const log of staleness.slice(-3)) {
          const parsed = oracle.interface.parseLog(log);
          if (!parsed) continue;
          collected.push({
            id: `${log.transactionHash}-${log.index}`,
            source: 'A7A5 Oracle',
            name: 'MaxStalenessUpdated',
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            args: { ...parsed.args },
          });
        }
      }

      collected.sort((a, b) => b.blockNumber - a.blockNumber);
      setEvents(collected.slice(0, MAX_EVENTS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent events (last ~500 blocks, 10-block fallback)</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[32rem] overflow-auto">
        {events.length === 0 && <p className="text-muted-foreground text-sm">No events in range.</p>}
        {events.map((ev) => (
          <div key={ev.id} className="rounded border p-2 text-xs">
            <p className="font-medium">
              {ev.source} · {ev.name} · block {ev.blockNumber}
            </p>
            <p className="font-mono break-all text-muted-foreground">{ev.txHash}</p>
            <pre className="mt-1 overflow-auto">{JSON.stringify(ev.args, null, 2)}</pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
