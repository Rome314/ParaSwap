import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletConnectionHeader } from '@openzeppelin/ui-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@openzeppelin/ui-components';
import { isForkMode } from '../config/env';
import { ForkPanel } from './panels/ForkPanel';
import { TokenPanel } from './panels/TokenPanel';
import { SwapPanel } from './panels/SwapPanel';
import { OraclePanel } from './panels/OraclePanel';
import { PaymasterPanel } from './panels/PaymasterPanel';
import { AccountPanel } from './panels/AccountPanel';

type DashTab = 'fork' | 'tokens' | 'swap' | 'oracles' | 'paymasters' | 'accounts';

export function ContractsDashboard() {
  const [tab, setTab] = useState<DashTab>('fork');

  return (
    <div className="oz-contracts min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Contract Admin</h1>
          <p className="text-muted-foreground text-sm">
            {isForkMode()
              ? '● Mainnet fork mode (localhost:8545)'
              : 'All read/write functions for every protocol contract'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/debug" className="text-sm text-primary hover:underline">
            AA Debug
          </Link>
          <Link to="/" className="text-sm text-primary hover:underline">
            ← Main app
          </Link>
          <WalletConnectionHeader />
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as DashTab)}>
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="fork">Fork / Dev</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="swap">Swap</TabsTrigger>
            <TabsTrigger value="oracles">Oracles</TabsTrigger>
            <TabsTrigger value="paymasters">Paymasters</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
          </TabsList>

          <TabsContent value="fork">
            <ForkPanel />
          </TabsContent>

          <TabsContent value="tokens">
            <TokenPanel />
          </TabsContent>

          <TabsContent value="swap">
            <SwapPanel />
          </TabsContent>

          <TabsContent value="oracles">
            <OraclePanel />
          </TabsContent>

          <TabsContent value="paymasters">
            <PaymasterPanel />
          </TabsContent>

          <TabsContent value="accounts">
            <AccountPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
