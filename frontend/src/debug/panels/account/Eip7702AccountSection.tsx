import { useCallback, useEffect, useState } from 'react';
import { Contract } from 'ethers';
import { useSignTypedData } from 'wagmi';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { useEip7702Account } from '../../hooks/useEip7702Account';
import { aaConfig } from '../../../lib/aa/config';
import {
  buildApprovalBatchCalls,
  buildErc7821BatchCalldata,
  defaultApprovals,
  type PackedUserOp,
  type TokenApproval,
} from '../../../lib/aa/userOp';
import {
  ensureEip7702Ready,
  formatWallet7702Error,
  revokeViaWallet,
} from '../../../lib/aa/eip7702';
import { packEip7702UserOp } from '../../../lib/aa/typedData';
import { ApprovalEditor } from './ApprovalEditor';
import { InteractionBuilder } from './InteractionBuilder';
import { DecodedCalldata } from './components/DecodedCalldata';
import { decodeCalldata } from '../../../lib/aa/decodeCalldata';

export interface Eip7702AccountSectionProps {
  onBalancesRefresh?: () => void;
}

export function Eip7702AccountSection({ onBalancesRefresh }: Eip7702AccountSectionProps) {
  const eip7702 = useEip7702Account();
  const { signTypedDataAsync } = useSignTypedData();
  const [approvals, setApprovals] = useState<TokenApproval[]>(() => defaultApprovals());

  useEffect(() => {
    void eip7702.refreshDelegation();
  }, [eip7702.address, eip7702.refreshDelegation]);

  const delegateCalldata = buildErc7821BatchCalldata(buildApprovalBatchCalls(approvals));
  const delegateDecoded = decodeCalldata(delegateCalldata, eip7702.address ?? undefined);

  const ensureReady = useCallback(async () => {
    if (!eip7702.walletClient || !eip7702.address || !aaConfig.eip7702Delegate) {
      throw new Error('Connect wallet to use EIP-7702 account');
    }
    await ensureEip7702Ready({
      walletClient: eip7702.walletClient,
      address: eip7702.address,
      expectedDelegate: aaConfig.eip7702Delegate,
      approvalCalldata: delegateCalldata,
    });
    await eip7702.refreshDelegation();
    onBalancesRefresh?.();
  }, [delegateCalldata, eip7702, onBalancesRefresh]);

  const enableNow = async () => {
    eip7702.setBusy(true);
    eip7702.setError(null);
    try {
      await ensureReady();
    } catch (e) {
      eip7702.setError(formatWallet7702Error(e));
    } finally {
      eip7702.setBusy(false);
    }
  };

  const revoke = async () => {
    if (!eip7702.walletClient) return;
    eip7702.setBusy(true);
    eip7702.setError(null);
    try {
      await revokeViaWallet(eip7702.walletClient);
      await eip7702.refreshDelegation();
    } catch (e) {
      eip7702.setError(formatWallet7702Error(e));
    } finally {
      eip7702.setBusy(false);
    }
  };

  const signAndPackUserOp = async (op: PackedUserOp, entryPoint: Contract) =>
    packEip7702UserOp(
      op,
      { getUserOpHash: (userOp) => entryPoint.getUserOpHash(userOp) as Promise<string> },
      signTypedDataAsync ?? undefined,
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>EIP-7702 account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!eip7702.isConnected ? (
            <p className="text-muted-foreground text-xs">
              Connect your wallet with the button in the header to use an EIP-7702 smart account.
              Your smart account address is the same as your connected wallet address.
            </p>
          ) : (
            <>
              <p className="font-mono text-xs break-all">
                Smart account (EOA): {eip7702.address}
              </p>
              {aaConfig.eip7702Delegate && (
                <p className="font-mono text-xs break-all text-muted-foreground">
                  Delegate implementation: {aaConfig.eip7702Delegate}
                </p>
              )}
              <p>
                Delegation:{' '}
                {eip7702.isDelegated ? (
                  <span className="text-green-600 font-medium">active</span>
                ) : eip7702.delegation ? (
                  <span className="text-amber-600">other ({eip7702.delegation.slice(0, 12)}…)</span>
                ) : (
                  <span className="text-muted-foreground">none — enabled on first transaction</span>
                )}
              </p>
            </>
          )}
          {eip7702.error && <p className="text-destructive text-xs">{eip7702.error}</p>}
          {eip7702.isConnected && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={eip7702.busy || eip7702.isDelegated || !aaConfig.eip7702Delegate}
                onClick={() => void enableNow()}
              >
                {eip7702.busy ? 'Working…' : 'Enable smart account now'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={eip7702.busy || !eip7702.delegation}
                onClick={() => void revoke()}
              >
                Revoke delegation
              </Button>
              <Button size="sm" variant="outline" onClick={() => void eip7702.refreshDelegation()}>
                Refresh
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delegation batch approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs">
            These token approvals are bundled into the first delegation transaction (type-4 setup).
          </p>
          <ApprovalEditor value={approvals} onChange={setApprovals} />
          <DecodedCalldata decoded={delegateDecoded} label="Type-4 execute batch preview" />
        </CardContent>
      </Card>

      <InteractionBuilder
        sender={eip7702.isConnected ? eip7702.address : null}
        showEthDirect={Boolean(eip7702.isDelegated)}
        signAndPackUserOp={signAndPackUserOp}
        ensureReady={eip7702.isConnected ? ensureReady : undefined}
        connectHint="Connect wallet to sign and send"
      />
    </div>
  );
}
