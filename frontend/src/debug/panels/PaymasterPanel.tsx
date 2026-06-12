import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount';
import { usePaymasterDebug } from '../hooks/usePaymasterDebug';

export function PaymasterPanel() {
  const passkey = usePasskeyAccount();
  const pm = usePaymasterDebug(passkey.address);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void pm.refresh()}>
          Refresh
        </Button>
      </div>

      {pm.error && <p className="text-destructive text-sm">{pm.error}</p>}

      {pm.snapshots.map((snap) => (
        <Card key={snap.address}>
          <CardHeader>
            <CardTitle>
              {snap.label} Paymaster {snap.paused ? '(paused)' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-mono text-xs break-all">{snap.address}</p>
            <p>Deposit: {snap.depositEth}</p>
            <p>EntryPoint balance: {snap.epBalanceEth}</p>
            <p>Oracle: {snap.oracle}</p>
            <p>Token: {snap.token}</p>
            <p>tokenPrice: {snap.priceLabel}</p>
            <p>validUntil: {snap.staleness ?? '—'}</p>
            <Button
              size="sm"
              className="mt-2"
              variant="outline"
              disabled={pm.loading || !passkey.address}
              onClick={() => void pm.simulateQuote(snap.label === 'USDT' ? 'usdt' : 'a7a5')}
            >
              Simulate gas quote
            </Button>
          </CardContent>
        </Card>
      ))}

      {pm.quoteError && <p className="text-destructive text-sm">{pm.quoteError}</p>}
      {pm.quote && (
        <Card>
          <CardHeader>
            <CardTitle>Gas estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(pm.quote, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
