import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { useOracleDebug } from '../hooks/useOracleDebug';

export function OraclePanel() {
  const oracle = useOracleDebug();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void oracle.refresh()} disabled={oracle.loading}>
          Refresh
        </Button>
      </div>

      {oracle.error && <p className="text-destructive text-sm">{oracle.error}</p>}

      {oracle.feeds.map((feed) => (
        <Card key={feed.id}>
          <CardHeader>
            <CardTitle>{feed.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-mono text-xs break-all">{feed.address}</p>
            {feed.price !== undefined && <p>Price: {feed.price}</p>}
            {feed.validUntil && <p>Staleness: {feed.validUntil}</p>}
            {feed.maxStaleness && <p>maxStaleness: {feed.maxStaleness}</p>}
            {feed.twapWindow !== undefined && <p>TWAP window: {feed.twapWindow}s</p>}
            {feed.pool && <p className="font-mono text-xs">Pool: {feed.pool}</p>}
            {feed.observationCardinality !== undefined && (
              <p>Observation cardinality: {feed.observationCardinality}</p>
            )}
            {feed.warmup && <p>TWAP warmup: {feed.warmup}</p>}
            {feed.updatedAt !== undefined && (
              <p>Last update age: {Math.max(0, Math.floor(Date.now() / 1000) - feed.updatedAt)}s ago</p>
            )}
            {feed.extra &&
              Object.entries(feed.extra).map(([k, v]) => (
                <p key={k}>
                  {k}: {v}
                </p>
              ))}
          </CardContent>
        </Card>
      ))}

      {oracle.feeds.length === 0 && !oracle.loading && (
        <p className="text-muted-foreground text-sm">Set oracle VITE_* addresses from fork:deploy output.</p>
      )}
    </div>
  );
}
