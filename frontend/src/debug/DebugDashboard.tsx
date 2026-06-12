import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletConnectionHeader } from '@openzeppelin/ui-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { ForkStatusPanel } from './panels/ForkStatusPanel';
import { SmartAccountPanel } from './panels/SmartAccountPanel';
import { PaymasterPanel } from './panels/PaymasterPanel';
import { OraclePanel } from './panels/OraclePanel';
import { UserOpPipelinePanel } from './panels/UserOpPipelinePanel';
import { EventLogPanel } from './panels/EventLogPanel';
import { isForkMode } from '../config/env';

type DebugTab =
  | 'fork'
  | 'account'
  | 'paymaster'
  | 'oracle'
  | 'userop'
  | 'events';

export function DebugDashboard() {
  const [tab, setTab] = useState<DebugTab>('fork');

  return (
    <div className="oz-debug min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">AA Debug Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {isForkMode() ? 'Mainnet fork mode' : 'Set VITE_CHAIN=hardhat-fork for local fork'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm text-primary hover:underline">
            ← Main app
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          <WalletConnectionHeader />
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DebugTab)}>
          <TabsList className="mb-4 flex flex-wrap h-auto">
            <TabsTrigger value="fork">Fork Status</TabsTrigger>
            <TabsTrigger value="account">Smart Account</TabsTrigger>
            <TabsTrigger value="paymaster">Paymasters</TabsTrigger>
            <TabsTrigger value="oracle">Oracles</TabsTrigger>
            <TabsTrigger value="userop">UserOp Pipeline</TabsTrigger>
            <TabsTrigger value="events">Event Log</TabsTrigger>
          </TabsList>

          <TabsContent value="fork">
            <ForkStatusPanel />
          </TabsContent>
          <TabsContent value="account">
            <SmartAccountPanel />
          </TabsContent>
          <TabsContent value="paymaster">
            <PaymasterPanel />
          </TabsContent>
          <TabsContent value="oracle">
            <OraclePanel />
          </TabsContent>
          <TabsContent value="userop">
            <UserOpPipelinePanel />
          </TabsContent>
          <TabsContent value="events">
            <EventLogPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
