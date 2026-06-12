import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { ContractStateWidget, TransactionForm } from '@openzeppelin/ui-renderer';
import { useWalletState } from '@openzeppelin/ui-react';
import type { TransactionFormCapabilities, ComposerEcosystemRuntime } from '@openzeppelin/ui-types';
import { A7A5_PAYMASTER_ABI, USDT_PAYMASTER_ABI } from '../lib/abis';
import { abiToContractSchema, getWriteFunctions, writeFnToRenderFormSchema } from '../lib/abiToSchema';
import { aaConfig } from '../../lib/aa/config';
import type { AbiFunction } from '../lib/abis';

// ─── Write function list ──────────────────────────────────────────────────────

function WriteFnList({
  abi,
  contractSchema,
  adapter,
}: {
  abi: AbiFunction[];
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
        const isOwnerOnly = ['pause', 'unpause', 'setOracle', 'withdraw', 'withdrawTokens', 'transferOwnership', 'renounceOwnership'].includes(fn.name);
        return (
          <div key={schema.id} className="rounded border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
              onClick={() => setOpenFn(isOpen ? null : schema.id)}
            >
              <span className="font-mono font-medium">{fn.name}</span>
              {isOwnerOnly && (
                <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs px-1.5 py-0.5">
                  owner
                </span>
              )}
              {fn.stateMutability === 'payable' && (
                <span className="rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs px-1.5 py-0.5">
                  payable
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                ({fn.inputs.map((i) => i.type).join(', ')})
              </span>
              <span className="ml-auto text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
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

function PaymasterSection({
  name,
  address,
  abi,
  description,
}: {
  name: string;
  address: string;
  abi: AbiFunction[];
  description?: string;
}) {
  const { activeRuntime } = useWalletState();
  const runtime = activeRuntime as ComposerEcosystemRuntime | null;
  const contractSchema = useMemo(() => abiToContractSchema(name, abi), [name, abi]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{name}</span>
        <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded break-all text-muted-foreground">
          {address || 'not configured — set VITE_*_PAYMASTER'}
        </code>
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
            <p className="text-sm text-muted-foreground">Connect wallet to read paymaster state.</p>
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

export function PaymasterPanel() {
  const [tab, setTab] = useState<'a7a5' | 'usdt'>('a7a5');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'a7a5' | 'usdt')}>
        <TabsList>
          <TabsTrigger value="a7a5">A7A5 Paymaster</TabsTrigger>
          <TabsTrigger value="usdt">USDT Paymaster</TabsTrigger>
        </TabsList>

        <TabsContent value="a7a5" className="mt-4">
          <PaymasterSection
            name="A7A5Paymaster"
            address={aaConfig.a7a5Paymaster}
            abi={A7A5_PAYMASTER_ABI}
            description="ERC-4337 paymaster that sponsors gas in ETH and charges users in A7A5 tokens. Handles fee-on-transfer (FOT) via balance-delta gross-up. Deposit/stake via EntryPoint before activating."
          />
        </TabsContent>

        <TabsContent value="usdt" className="mt-4">
          <PaymasterSection
            name="UsdtPaymaster"
            address={aaConfig.usdtPaymaster}
            abi={USDT_PAYMASTER_ABI}
            description="ERC-4337 paymaster that sponsors gas in ETH and charges users in USDT (standard ERC-20). Priced via the UsdtNativeOracle (Chainlink USDT/ETH feed)."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
