import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@openzeppelin/ui-components';
import { useForkStatus } from '../hooks/useForkStatus';
import { formatTokenAmount } from '../../lib/aa/decode';

export function ForkStatusPanel() {
  const { status, loading, refresh, deployJson, loadDeployJson, contractTable } = useForkStatus();
  const [jsonInput, setJsonInput] = useState('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fork RPC</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-4">
            <span className={status.healthy ? 'text-green-600' : 'text-red-600'}>
              {status.healthy ? '● healthy' : '● unreachable'}
            </span>
            <span>RPC: {status.rpcUrl}</span>
          </div>
          <div className="flex gap-4">
            <span>chainId: {status.chainId ?? '—'}</span>
            <span>block: {status.blockNumber ?? '—'}</span>
          </div>
          {status.error && <p className="text-destructive">{status.error}</p>}
          {status.entryPointDeposit && (
            <div className="mt-2 space-y-1 border-t pt-2">
              <p className="font-medium">EntryPoint deposits</p>
              <p>A7A5 PM: {formatTokenAmount(status.entryPointDeposit.a7a5 ?? 0n, 18, 'ETH')}</p>
              <p>USDT PM: {formatTokenAmount(status.entryPointDeposit.usdt ?? 0n, 18, 'ETH')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract addresses</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-2">Contract</th>
                <th className="py-1 pr-2">Env</th>
                <th className="py-1">Address</th>
              </tr>
            </thead>
            <tbody>
              {contractTable.map((row) => (
                <tr key={row.label} className="border-b border-border/50">
                  <td className="py-1 pr-2">{row.label}</td>
                  <td className="py-1 pr-2 font-mono text-xs text-muted-foreground">{row.envKey}</td>
                  <td className="py-1 font-mono text-xs break-all">{row.address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Load fork:deploy JSON</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder='Paste JSON from "npm run fork:deploy"'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={5}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              try {
                loadDeployJson(jsonInput);
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Parse JSON
          </Button>
          {Object.keys(deployJson).length > 0 && (
            <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(deployJson, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
