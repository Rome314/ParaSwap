import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { ContractStateWidget, TransactionForm } from '@openzeppelin/ui-renderer';
import { useWalletState } from '@openzeppelin/ui-react';
import type { TransactionFormCapabilities, ComposerEcosystemRuntime } from '@openzeppelin/ui-types';
import {
  A7A5_NATIVE_ORACLE_ABI,
  A7A5_USDT_TWAP_ORACLE_ABI,
  A7A5_USDT_V2_ORACLE_ABI,
  USDT_NATIVE_ORACLE_ABI,
  MAINNET_CHAINLINK_USDT_ETH,
} from '../lib/abis';
import { abiToContractSchema, getWriteFunctions, writeFnToRenderFormSchema } from '../lib/abiToSchema';
import { aaConfig } from '../../lib/aa/config';
import type { AbiFunction } from '../lib/abis';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
              className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
              onClick={() => setOpenFn(isOpen ? null : schema.id)}
            >
              <span className="font-mono font-medium">{fn.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
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

function OracleSection({
  name,
  address,
  abi,
  description,
  badge,
}: {
  name: string;
  address: string;
  abi: AbiFunction[];
  description?: string;
  badge?: string;
}) {
  const { activeRuntime } = useWalletState();
  const runtime = activeRuntime as ComposerEcosystemRuntime | null;
  const contractSchema = useMemo(() => abiToContractSchema(name, abi), [name, abi]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{name}</span>
        {badge && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{badge}</span>
        )}
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
              contractAddress={address}
              query={runtime.query}
              schema={runtime.schema}
              isVisible={true}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Connect wallet to read oracle state.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Write Functions (owner only)</CardTitle></CardHeader>
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

type OracleTab = 'a7a5-native' | 'a7a5-twap' | 'a7a5-v2' | 'usdt-native';

export function OraclePanel() {
  const [tab, setTab] = useState<OracleTab>('a7a5-native');

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as OracleTab)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="a7a5-native">A7A5 Native</TabsTrigger>
          <TabsTrigger value="a7a5-twap">A7A5/USDT TWAP</TabsTrigger>
          <TabsTrigger value="a7a5-v2">A7A5/USDT V2</TabsTrigger>
          <TabsTrigger value="usdt-native">USDT Native</TabsTrigger>
        </TabsList>

        <TabsContent value="a7a5-native" className="mt-4">
          <OracleSection
            name="A7A5NativeOracle"
            address={aaConfig.a7a5NativeOracle}
            abi={A7A5_NATIVE_ORACLE_ABI}
            badge="ERC-4337 paymaster"
            description="Derives A7A5/ETH price from (USDT/ETH) ÷ (USDT/A7A5). Used by A7A5Paymaster to bill gas in A7A5 tokens. tokenPrice() reverts if stale; tokenPriceData() never reverts."
          />
        </TabsContent>

        <TabsContent value="a7a5-twap" className="mt-4">
          <OracleSection
            name="A7A5UsdtTwapOracle"
            address={aaConfig.a7a5TwapOracle}
            abi={A7A5_USDT_TWAP_ORACLE_ABI}
            badge="Chainlink-compatible"
            description="TWAP oracle for USDT/A7A5 price (8 decimals) using the wA7A5/USDT Uniswap V3 pool. Feeds into A7A5NativeOracle. Requires the pool's TWAP observation window to be warm."
          />
        </TabsContent>

        <TabsContent value="a7a5-v2" className="mt-4">
          <OracleSection
            name="A7A5UsdtV2Oracle"
            address=""
            abi={A7A5_USDT_V2_ORACLE_ABI}
            badge="Spot / alternative"
            description="Alternative USDT/A7A5 oracle reading spot reserves from the Uniswap V2 A7A5/USDT pair. No owner, no staleness controls. Read-only."
          />
        </TabsContent>

        <TabsContent value="usdt-native" className="mt-4">
          <OracleSection
            name="UsdtNativeOracle"
            address={aaConfig.usdtNativeOracle}
            abi={USDT_NATIVE_ORACLE_ABI}
            badge="ERC-4337 paymaster"
            description={`USDT/ETH price oracle sourced from Chainlink feed (${MAINNET_CHAINLINK_USDT_ETH}). Used by UsdtPaymaster to bill gas in USDT.`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
