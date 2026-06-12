import { useCallback, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { getDelegation } from '../../lib/aa/eip7702';
import { aaConfig } from '../../lib/aa/config';

export function useEip7702Account() {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [delegation, setDelegation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDelegation = useCallback(async () => {
    if (!address) {
      setDelegation(null);
      return;
    }
    try {
      const d = await getDelegation(address);
      setDelegation(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [address]);

  const isDelegated =
    delegation !== null &&
    aaConfig.eip7702Delegate &&
    delegation.toLowerCase() === aaConfig.eip7702Delegate.toLowerCase();

  return {
    address: address ?? null,
    isConnected,
    chainId,
    walletClient,
    delegation,
    isDelegated,
    busy,
    setBusy,
    error,
    setError,
    refreshDelegation,
    expectedDelegate: aaConfig.eip7702Delegate,
  };
}
