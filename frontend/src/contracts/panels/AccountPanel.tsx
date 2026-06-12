import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { ContractStateWidget, TransactionForm } from '@openzeppelin/ui-renderer';
import { useWalletState } from '@openzeppelin/ui-react';
import type { TransactionFormCapabilities, ComposerEcosystemRuntime } from '@openzeppelin/ui-types';
import { A7A5_ACCOUNT_FACTORY_ABI, A7A5_WEBAUTHN_ACCOUNT_ABI, SIMPLE_A7A5_ACCOUNT_ABI } from '../lib/abis';
import { abiToContractSchema, getWriteFunctions, writeFnToRenderFormSchema } from '../lib/abiToSchema';
import { aaConfig } from '../../lib/aa/config';
import type { AbiFunction } from '../lib/abis';

// ─── Write fn list ────────────────────────────────────────────────────────────

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

  if (writeFns.length === 0) {
    return <p className="text-sm text-muted-foreground">No write functions.</p>;
  }

  return (
    <div className="space-y-2">
      {writeFns.map((fn) => {
        const schema = writeFnToRenderFormSchema(fn);
        const isOpen = openFn === schema.id;
        return (
          <div key={schema.id} className="rounded border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
              onClick={() => setOpenFn(isOpen ? null : schema.id)}
            >
              <span className="font-mono font-medium">{fn.name}</span>
              {fn.stateMutability === 'payable' && (
                <span className="rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs px-1.5 py-0.5">payable</span>
              )}
              <span className="text-xs text-muted-foreground">
                ({fn.inputs.map((i) => `${i.type} ${i.name}`).join(', ')})
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

function AccountSection({
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
          {address || 'not configured'}
        </code>
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      <Card>
        <CardHeader><CardTitle className="text-sm">Read Functions</CardTitle></CardHeader>
        <CardContent>
          {runtime?.query && runtime?.schema ? (
            <ContractStateWidget
              contractSchema={contractSchema}
              contractAddress={address || '0x0000000000000000000000000000000000000000'}
              query={runtime.query}
              schema={runtime.schema}
              isVisible={!!address}
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

type AccountTab = 'factory' | 'webauthn' | 'simple';

export function AccountPanel() {
  const [tab, setTab] = useState<AccountTab>('factory');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as AccountTab)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="factory">Account Factory</TabsTrigger>
          <TabsTrigger value="webauthn">WebAuthn Account</TabsTrigger>
          <TabsTrigger value="simple">Simple Account</TabsTrigger>
        </TabsList>

        <TabsContent value="factory" className="mt-4">
          <AccountSection
            name="A7A5AccountFactory"
            address={aaConfig.accountFactory}
            abi={A7A5_ACCOUNT_FACTORY_ABI}
            description="CREATE2 factory for deterministic minimal-proxy clones of A7A5WebAuthnAccount. Use predictAddress() to compute the counterfactual address before deployment. Use cloneAndInitialize() to deploy and initialise in a single transaction."
          />
        </TabsContent>

        <TabsContent value="webauthn" className="mt-4">
          <AccountSection
            name="A7A5WebAuthnAccount"
            address=""
            abi={A7A5_WEBAUTHN_ACCOUNT_ABI}
            description="ERC-4337 smart account with WebAuthn (P-256 passkey) signature verification and ERC-7821 batch execution. Enter a deployed account address below to read its state. The signer() returns (qx, qy) passkey coordinates; initializeWebAuthn() sets them (one-time)."
          />
        </TabsContent>

        <TabsContent value="simple" className="mt-4">
          <AccountSection
            name="SimpleA7A5Account"
            address=""
            abi={SIMPLE_A7A5_ACCOUNT_ABI}
            description="Minimal single-owner ERC-4337 account using ECDSA signatures. Used for testing. Not for production. Enter a deployed account address to inspect or execute calls via the EntryPoint."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
