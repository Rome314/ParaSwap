import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RuntimeProvider, WalletStateProvider } from '@openzeppelin/ui-react';
import { ecosystemDefinition, ethereumMainnet } from '@openzeppelin/adapter-evm';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import type { NetworkConfig } from '@openzeppelin/ui-types';
import { env } from '../../config/env';

const queryClient = new QueryClient();

const forkNetwork: NetworkConfig = {
  ...ethereumMainnet,
  id: 'ethereum-fork',
  exportConstName: 'ethereumFork',
  name: 'Mainnet Fork',
  rpcUrl: env.forkRpcUrl,
  chainId: 1,
  viemChain: {
    ...ethereumMainnet.viemChain!,
    id: 1,
    name: 'Mainnet Fork',
    rpcUrls: { default: { http: [env.forkRpcUrl] } },
  },
};

const networkCatalog: Record<string, NetworkConfig> = {
  [ethereumMainnet.id]: ethereumMainnet,
  [forkNetwork.id]: forkNetwork,
};

function getNetworkConfigById(networkId: string): NetworkConfig | null {
  return networkCatalog[networkId] ?? null;
}

async function resolveRuntime(networkConfig: NetworkConfig) {
  return ecosystemDefinition.createRuntime('transactor', networkConfig);
}

export function OzDebugProviders({ children }: { children: ReactNode }) {
  const initialNetworkId = useMemo(() => forkNetwork.id, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Wagmi context comes from main.tsx; RainbowKit only needs to sit inside it. */}
      <RainbowKitProvider>
        <RuntimeProvider resolveRuntime={resolveRuntime}>
          <WalletStateProvider
            initialNetworkId={initialNetworkId}
            getNetworkConfigById={getNetworkConfigById}
          >
            {children}
          </WalletStateProvider>
        </RuntimeProvider>
      </RainbowKitProvider>
    </QueryClientProvider>
  );
}
