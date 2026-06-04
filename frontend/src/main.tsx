import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { App } from './App';
import { Toaster } from './components/ui/Toaster';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const label = String(query.queryKey[0] ?? 'query');
      const msg = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(new CustomEvent('app-error', { detail: `${label}: ${msg}` }));
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
