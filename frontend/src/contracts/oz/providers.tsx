import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RuntimeProvider, WalletStateProvider } from '@openzeppelin/ui-react';
import { ecosystemDefinition, ethereumMainnet } from '@openzeppelin/adapter-evm';
import type { NetworkConfig } from '@openzeppelin/ui-types';
import { env, isForkMode } from '../../config/env';

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
  return ecosystemDefinition.createRuntime('composer', networkConfig);
}

export function OzContractsProviders({ children }: { children: ReactNode }) {
  const initialNetworkId = useMemo(
    () => (isForkMode() ? forkNetwork.id : ethereumMainnet.id),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeProvider resolveRuntime={resolveRuntime}>
        <WalletStateProvider
          initialNetworkId={initialNetworkId}
          getNetworkConfigById={getNetworkConfigById}
        >
          {children}
        </WalletStateProvider>
      </RuntimeProvider>
    </QueryClientProvider>
  );
}
