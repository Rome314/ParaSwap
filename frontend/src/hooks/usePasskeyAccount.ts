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

  const configured = isAaConfigured();
  const provider = chainId ? getProvider(chainId) : null;

  const refreshAddress = useCallback(async () => {
    if (!provider) return;
    const freshCoords = loadStoredPasskeyCoords();
    if (!freshCoords?.qx) return;
    try {
      const addr = await predictAccountAddress(provider, freshCoords.qx, freshCoords.qy);
      setAddress(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [provider]);

  const createPasskey = useCallback(
    async (label = 'a7a5-user') => {
      setBusy(true);
      setError(null);
      try {
        const { coords: newCoords } = await registerPasskey(label);
        if (provider) {
          const addr = await predictAccountAddress(provider, newCoords.qx, newCoords.qy);
          setAddress(addr);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [provider],
  );

  const signUserOp = useCallback(async (userOpHash: string) => {
    return signWithPasskey(userOpHash);
  }, []);

  return {
    configured,
    coords: loadStoredPasskeyCoords(),
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
