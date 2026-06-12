import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { ContractStateWidget, TransactionForm } from '@openzeppelin/ui-renderer';
import { useWalletState } from '@openzeppelin/ui-react';
import type { TransactionFormCapabilities, ComposerEcosystemRuntime } from '@openzeppelin/ui-types';
import { PARASWAP_ABI, POOLS_FACADE_ABI } from '../lib/abis';
import { abiToContractSchema, getWriteFunctions, writeFnToRenderFormSchema } from '../lib/abiToSchema';
import { aaConfig } from '../../lib/aa/config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<number, string> = { 0: '0 = BUY (USDT→A7A5)', 1: '1 = SELL (A7A5→USDT)' };

function SideHint() {
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Side: {Object.entries(SIDE_LABELS).map(([k, v]) => <span key={k} className="mr-2">{v}</span>)}
    </p>
  );
}

function WriteFnList({
  abi,
  contractSchema,
  adapter,
}: {
  abi: typeof PARASWAP_ABI;
  contractSchema: ReturnType<typeof abiToContractSchema>;
  adapter: TransactionFormCapabilities;
}) {
  const writeFns = useMemo(() => getWriteFunctions(abi), [abi]);
  const [openFn, setOpenFn] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {writeFns.map((fn) => {
        const schema = writeFnToRenderFormSchema(fn);
        const isOpen = openFn === schema.id;
        return (
          <div key={schema.id} className="rounded border border-border overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
              onClick={() => setOpenFn(isOpen ? null : schema.id)}
            >
              <span className="font-mono font-medium">{fn.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({fn.inputs.map((i) => i.type).join(', ')}) → {fn.outputs?.map((o) => o.type).join(', ') || 'void'}
              </span>
              <span className="ml-auto text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-border p-4 bg-muted/20">
                {(fn.name.startsWith('swap') || fn.name === 'getBestQuoteA7A5PerUSDT' || fn.name === 'quoteWA7A5PerUSDT') && <SideHint />}
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

// ─── Contract section ──────────────────────────────────────────────────────────

function ContractSection({
  name,
  address,
  abi,
  description,
}: {
  name: string;
  address: string;
  abi: typeof PARASWAP_ABI;
  description?: string;
}) {
  const { activeRuntime } = useWalletState();
  const runtime = activeRuntime as ComposerEcosystemRuntime | null;
  const contractSchema = useMemo(() => abiToContractSchema(name, abi), [name, abi]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground text-sm">{name}</span>
        <code className="font-mono bg-muted px-2 py-0.5 rounded break-all">{address || 'address not set — configure env vars'}</code>
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      <Card>
        <CardHeader><CardTitle className="text-sm">Read Functions</CardTitle></CardHeader>
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

      <Card>
        <CardHeader><CardTitle className="text-sm">Write Functions</CardTitle></CardHeader>
        <CardContent>
          {runtime ? (
            <WriteFnList
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

export function SwapPanel() {
  const [contract, setContract] = useState<'paraswap' | 'facade'>('paraswap');

  return (
    <div className="space-y-4">
      <Tabs value={contract} onValueChange={(v) => setContract(v as 'paraswap' | 'facade')}>
        <TabsList>
          <TabsTrigger value="paraswap">ParaSwap</TabsTrigger>
          <TabsTrigger value="facade">PoolsFacade</TabsTrigger>
        </TabsList>

        <TabsContent value="paraswap" className="mt-4">
          <ContractSection
            name="ParaSwap"
            address={aaConfig.paraSwap}
            abi={PARASWAP_ABI}
            description="Multi-route swap router. Routes A7A5/WA7A5/USDT swaps through V2 or V3 depending on the token pair. The fee param is the Uniswap V3 pool fee tier (e.g. 500 = 0.05%)."
          />
        </TabsContent>

        <TabsContent value="facade" className="mt-4">
          <ContractSection
            name="PoolsFacade"
            address={aaConfig.poolsFacade}
            abi={POOLS_FACADE_ABI}
            description="Facade over Uniswap V2 and V3 for A7A5↔USDT swaps. Selects the best route (DIRECT=V2, MIXED=wA7A5 via V3) at execution time. side: 0=BUY (USDT in, A7A5 out), 1=SELL (A7A5 in, USDT out)."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
