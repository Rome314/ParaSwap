import { useEffect } from 'react';
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount';
import { useSponsoredSwap } from '../../hooks/useSponsoredSwap';
import { Btn, SectionTitle } from '../ui/ui';
import { aaConfig } from '../../lib/aa/config';

export function PasskeyWallet() {
  const passkey = usePasskeyAccount();
  const swap = useSponsoredSwap();

  useEffect(() => {
    void passkey.refreshAddress();
  }, [passkey.coords?.qx]);

  if (!passkey.configured) {
    return (
      <div className="rounded-xl border border-rim bg-surface2 p-6">
        <SectionTitle>Passkey smart account</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Set VITE_ENTRYPOINT_V08, VITE_ACCOUNT_FACTORY, VITE_BUNDLER_URL, and paymaster addresses in .env to enable
          ERC-4337 passkey flows.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-xl border border-rim bg-surface2 p-6">
      <SectionTitle>Passkey smart account</SectionTitle>

      {!passkey.coords ? (
        <Btn onClick={() => passkey.createPasskey()} disabled={passkey.busy}>
          {passkey.busy ? 'Creating passkey…' : 'Create passkey'}
        </Btn>
      ) : (
        <>
          <p className="font-mono text-xs text-muted">
            Account: {passkey.address ?? '…'} · Factory: {aaConfig.accountFactory.slice(0, 10)}…
          </p>
          <p className="text-sm text-muted">
            Gas can be paid in A7A5 or USDT via token paymasters (no ETH required on the smart account).
          </p>
          {passkey.error && <p className="text-sm text-accent3">{passkey.error}</p>}
          {swap.error && <p className="text-sm text-accent3">{swap.error}</p>}
          {swap.lastHash && (
            <p className="font-mono text-xs break-all text-accent2">UserOp: {swap.lastHash}</p>
          )}
        </>
      )}
    </div>
  );
}
