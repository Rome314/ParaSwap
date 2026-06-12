import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@openzeppelin/ui-components';
import { useForkStatus } from '../../debug/hooks/useForkStatus';
import { formatTokenAmount } from '../../lib/aa/decode';
import { MAINNET_A7A5, MAINNET_WA7A5, MAINNET_USDT } from '../lib/abis';

export function ForkPanel() {
  const { status, loading, refresh, deployJson, loadDeployJson, contractTable } = useForkStatus();
  const [jsonInput, setJsonInput] = useState('');

  return (
    <div className="space-y-4">
      {/* Fork RPC health */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fork RPC</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <span className={status.healthy ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {status.healthy ? '● Healthy' : '● Unreachable'}
            </span>
            <span className="text-muted-foreground">RPC: {status.rpcUrl}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            <span>chainId: <strong className="text-foreground">{status.chainId ?? '—'}</strong></span>
            <span>block: <strong className="text-foreground">{status.blockNumber ?? '—'}</strong></span>
          </div>
          {status.error && (
            <p className="rounded bg-destructive/10 p-2 text-destructive text-xs">{status.error}</p>
          )}
          {status.entryPointDeposit && (
            <div className="mt-2 space-y-1 border-t pt-2">
              <p className="font-medium">EntryPoint deposits</p>
              <p>A7A5 Paymaster: {formatTokenAmount(status.entryPointDeposit.a7a5 ?? 0n, 18, 'ETH')}</p>
              <p>USDT Paymaster: {formatTokenAmount(status.entryPointDeposit.usdt ?? 0n, 18, 'ETH')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Local dev setup guide */}
      <Card>
        <CardHeader>
          <CardTitle>Local Fork Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Run these commands in the <code className="text-xs bg-muted px-1 rounded">blockchain/</code> directory:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li><code className="text-xs bg-muted px-1 rounded">npm run fork:start</code> — start local hardhat fork on :8545</li>
            <li><code className="text-xs bg-muted px-1 rounded">npm run fork:deploy</code> — deploy all protocol contracts</li>
            <li>Copy the JSON output, paste it below, click Parse JSON</li>
            <li>Set <code className="text-xs bg-muted px-1 rounded">VITE_CHAIN=hardhat-fork</code> in <code className="text-xs bg-muted px-1 rounded">frontend/.env</code> and restart</li>
          </ol>
        </CardContent>
      </Card>

      {/* Protocol contract addresses */}
      <Card>
        <CardHeader>
          <CardTitle>Protocol Contract Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-4">Contract</th>
                <th className="py-1 pr-4 text-xs font-normal text-muted-foreground">Env var</th>
                <th className="py-1">Address</th>
              </tr>
            </thead>
            <tbody>
              {contractTable.map((row) => (
                <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 pr-4">{row.label}</td>
                  <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">{row.envKey}</td>
                  <td className="py-1 font-mono text-xs break-all">
                    {row.address
                      ? <span className="text-foreground">{row.address}</span>
                      : <span className="text-muted-foreground">not set</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mainnet token addresses (static) */}
      <Card>
        <CardHeader>
          <CardTitle>Mainnet Token Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="font-mono text-xs">
              <tr className="border-b border-border/50">
                <td className="py-1 pr-4 font-sans font-medium">A7A5</td>
                <td className="py-1">{MAINNET_A7A5}</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-1 pr-4 font-sans font-medium">WA7A5</td>
                <td className="py-1">{MAINNET_WA7A5}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-sans font-medium">USDT</td>
                <td className="py-1">{MAINNET_USDT}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Import fork:deploy output */}
      <Card>
        <CardHeader>
          <CardTitle>Load fork:deploy JSON</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            placeholder={'Paste JSON output from "npm run fork:deploy"'}
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
                setJsonInput('');
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Parse &amp; Import
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
