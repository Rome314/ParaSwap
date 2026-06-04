import { useState, useEffect, useCallback } from 'react';

export interface TronLikeProvider {
  request: (args: { method: string }) => Promise<{ code: number }>;
}

export interface TronProviderEntry {
  id: string;
  name: string;
  provider: TronLikeProvider;
}

export interface TronWalletState {
  address: string | null;
  isConnected: boolean;
  isAvailable: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const TRON_PROVIDER_DEFS: { id: string; name: string; get: () => TronLikeProvider | undefined }[] =
  [
    { id: 'tronlink', name: 'TronLink', get: () => (window as any).tronLink },
    { id: 'okx', name: 'OKX Wallet', get: () => (window as any).okxwallet?.tronLink },
    { id: 'bitget', name: 'Bitget', get: () => (window as any).bitkeep?.tronLink },
    { id: 'tokenpocket', name: 'TokenPocket', get: () => (window as any).tokenpocket?.tron },
  ];

function detectTronProviders(): TronProviderEntry[] {
  if (typeof window === 'undefined') return [];
  return TRON_PROVIDER_DEFS.flatMap(({ id, name, get }) => {
    const provider = get();
    return provider ? [{ id, name, provider }] : [];
  });
}

export function useTronProviders(): TronProviderEntry[] {
  const [providers, setProviders] = useState<TronProviderEntry[]>(() => detectTronProviders());

  useEffect(() => {
    // Re-check after a short delay in case wallets inject asynchronously
    const timer = setTimeout(() => setProviders(detectTronProviders()), 500);
    return () => clearTimeout(timer);
  }, []);

  return providers;
}

export function useTronWallet(providerEntry?: TronProviderEntry): TronWalletState {
  const [address, setAddress] = useState<string | null>(null);

  const resolveProvider = useCallback((): TronLikeProvider | undefined => {
    if (providerEntry) return providerEntry.provider;
    return (window as any).tronLink;
  }, [providerEntry]);

  const isAvailable = typeof window !== 'undefined' && !!resolveProvider();

  // Read already-connected address on mount (TronLink may already be unlocked)
  useEffect(() => {
    function readAddress() {
      const addr = (window as any).tronWeb?.defaultAddress?.base58;
      if (addr) setAddress(addr as string);
    }

    // Only request accounts when the user explicitly selected a provider —
    // avoids auto-prompting TronLink while the ETH chain is active.
    if (providerEntry) {
      const p = resolveProvider();
      if (p) {
        p.request({ method: 'tron_requestAccounts' })
          .then((result) => {
            if (result.code === 200) readAddress();
          })
          .catch(() => {});
      }
    }

    readAddress();

    // TronLink dispatches postMessage events for account changes
    function handleMessage(e: MessageEvent) {
      const action = e.data?.message?.action as string | undefined;
      if (action === 'setAccount' || action === 'accountsChanged') {
        const addr = e.data.message.data?.address as string | undefined;
        setAddress(addr || null);
      }
      if (action === 'disconnect') {
        setAddress(null);
      }
      if (action === 'setNode') {
        setTimeout(readAddress, 200);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [resolveProvider, providerEntry]);

  const connect = useCallback(async () => {
    const p = resolveProvider();
    if (!p) return;
    try {
      const result = await p.request({ method: 'tron_requestAccounts' });
      if (result.code === 200) {
        const addr = (window as any).tronWeb?.defaultAddress?.base58;
        if (addr) setAddress(addr as string);
      }
    } catch {
      // user rejected or provider unavailable
    }
  }, [resolveProvider]);

  const disconnect = useCallback(() => setAddress(null), []);

  return { address, isConnected: !!address, isAvailable, connect, disconnect };
}
