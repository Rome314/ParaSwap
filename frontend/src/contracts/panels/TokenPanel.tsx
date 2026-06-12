import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Button } from '@openzeppelin/ui-components';
import { ContractStateWidget, TransactionForm } from '@openzeppelin/ui-renderer';
import { useWalletState } from '@openzeppelin/ui-react';
import type { TransactionFormCapabilities, ComposerEcosystemRuntime } from '@openzeppelin/ui-types';
import { A7A5_ABI, WA7A5_ABI, MAINNET_A7A5, MAINNET_WA7A5 } from '../lib/abis';
import { abiToContractSchema, getWriteFunctions, writeFnToRenderFormSchema } from '../lib/abiToSchema';

// ─── Shared helper ─────────────────────────────────────────────────────────────

function WriteFnAccordion({
  abi,
  contractSchema,
  adapter,
}: {
  abi: typeof A7A5_ABI;
  contractSchema: ReturnType<typeof abiToContractSchema>;
  adapter: TransactionFormCapabilities;
}) {
  const writeFns = useMemo(() => getWriteFunctions(abi), [abi]);
  const [openFn, setOpenFn] = useState<string | null>(null);

  if (writeFns.length === 0) return null;

  return (
    <div className="space-y-2">
      {writeFns.map((fn) => {
        const schema = writeFnToRenderFormSchema(fn);
        const isOpen = openFn === schema.id;
        return (
          <div key={schema.id} className="rounded border border-border overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
              onClick={() => setOpenFn(isOpen ? null : schema.id)}
            >
              <span className="font-mono">{fn.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {fn.stateMutability === 'payable' ? 'payable' : ''}
                {fn.inputs.length > 0 ? `(${fn.inputs.map(i => i.type).join(', ')})` : '()'}
              </span>
              <span className="ml-auto">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-border p-4 bg-muted/20">
                <TransactionForm
                  schema={schema}
                  contractSchema={contractSchema}
                  adapter={adapter}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Single token section ──────────────────────────────────────────────────────

function TokenSection({
  name,
  address,
  abi,
}: {
  name: string;
  address: string;
  abi: typeof A7A5_ABI;
}) {
  const { activeRuntime } = useWalletState();
  const runtime = activeRuntime as ComposerEcosystemRuntime | null;

  const contractSchema = useMemo(() => abiToContractSchema(name, abi), [name, abi]);

  return (
    <div className="space-y-4">
      {/* Address badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span>
        <code className="font-mono bg-muted px-2 py-0.5 rounded break-all">{address}</code>
      </div>

      {/* View functions via OZ ContractStateWidget */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Read Functions</CardTitle>
        </CardHeader>
        <CardContent>
          {runtime?.query && runtime?.schema ? (
            <ContractStateWidget
              contractSchema={contractSchema}
              contractAddress={address}
              query={runtime.query}
              schema={runtime.schema}
              isVisible={true}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Connect wallet to read contract state.</p>
          )}
        </CardContent>
      </Card>

      {/* Write functions via OZ TransactionForm */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Write Functions</CardTitle>
        </CardHeader>
        <CardContent>
          {runtime ? (
            <WriteFnAccordion
              abi={abi}
              contractSchema={contractSchema}
              adapter={runtime as unknown as TransactionFormCapabilities}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Connect wallet to use write functions.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────

export function TokenPanel() {
  const [token, setToken] = useState<'a7a5' | 'wa7a5'>('a7a5');

  return (
    <div className="space-y-4">
      <Tabs value={token} onValueChange={(v) => setToken(v as 'a7a5' | 'wa7a5')}>
        <TabsList>
          <TabsTrigger value="a7a5">A7A5 Token</TabsTrigger>
          <TabsTrigger value="wa7a5">WA7A5 Token</TabsTrigger>
        </TabsList>

        <TabsContent value="a7a5" className="mt-4">
          <TokenSection
            name="A7A5"
            address={MAINNET_A7A5}
            abi={A7A5_ABI}
          />
        </TabsContent>

        <TabsContent value="wa7a5" className="mt-4">
          <TokenSection
            name="WA7A5"
            address={MAINNET_WA7A5}
            abi={WA7A5_ABI}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
