import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { getProvider } from '../lib/a7a5/helpers';
import { aaConfig, isAaConfigured } from '../lib/aa/config';
import { loadStoredPasskeyCoords, registerPasskey, signWithPasskey } from '../lib/aa/passkey';
import { predictAccountAddress } from '../lib/aa/userOp';

export function usePasskeyAccount() {
  const { chainId } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const coords = loadStoredPasskeyCoords();
  const configured = isAaConfigured();
  const provider = chainId ? getProvider(chainId) : null;

  const refreshAddress = useCallback(async () => {
    if (!provider || !coords?.qx) return;
    const addr = await predictAccountAddress(provider, coords.qx, coords.qy);
    setAddress(addr);
  }, [provider, coords?.qx, coords?.qy]);

  const createPasskey = useCallback(
    async (label = 'a7a5-user') => {
      setBusy(true);
      setError(null);
      try {
        await registerPasskey(label);
        await refreshAddress();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [refreshAddress],
  );

  const signUserOp = useCallback(async (userOpHash: string) => {
    return signWithPasskey(userOpHash);
  }, []);

  return {
    configured,
    coords,
    address,
    busy,
    error,
    createPasskey,
    signUserOp,
    refreshAddress,
    entryPoint: aaConfig.entryPoint,
    factory: aaConfig.accountFactory,
  };
}
