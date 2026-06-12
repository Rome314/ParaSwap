import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { useWriteContract } from 'wagmi';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { usePasskeyAccount } from '../../../hooks/usePasskeyAccount';
import { env } from '../../../config/env';
import { aaConfig } from '../../../lib/aa/config';
import {
  ACCOUNT_FACTORY_ABI,
  attachWebAuthnSignature,
  buildInitCodeWithApprovals,
  encodeInitializeWebAuthn,
  defaultApprovals,
  type PackedUserOp,
  type TokenApproval,
} from '../../../lib/aa/userOp';
import { ApprovalEditor } from './ApprovalEditor';
import { InteractionBuilder } from './InteractionBuilder';
import { DecodedCalldata } from './components/DecodedCalldata';
import { decodeCalldata } from '../../../lib/aa/decodeCalldata';

export interface PasskeyAccountSectionProps {
  onBalancesRefresh?: () => void;
}

export function PasskeyAccountSection({ onBalancesRefresh }: PasskeyAccountSectionProps) {
  const passkey = usePasskeyAccount();
  const { writeContractAsync } = useWriteContract();
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [approvals, setApprovals] = useState<TokenApproval[]>(() => defaultApprovals());
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  useEffect(() => {
    void passkey.refreshAddress();
  }, [passkey.refreshAddress]);

  const refreshDeployed = useCallback(async () => {
    if (!passkey.address) return;
    const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
    const code = await provider.getCode(passkey.address);
    setDeployed(code !== '0x');
  }, [passkey.address]);

  useEffect(() => {
    void refreshDeployed();
  }, [refreshDeployed]);

  const initCalldata =
    passkey.coords ? encodeInitializeWebAuthn(passkey.coords.qx, passkey.coords.qy) : null;

  const deployNow = async () => {
    if (!initCalldata || !aaConfig.accountFactory) return;
    setDeployBusy(true);
    setDeployError(null);
    try {
      await writeContractAsync({
        address: aaConfig.accountFactory as `0x${string}`,
        abi: ACCOUNT_FACTORY_ABI,
        functionName: 'cloneAndInitializeWithApprovals',
        args: [initCalldata, approvals.map((a) => [a.token, a.spender, a.amount])],
      });
      await refreshDeployed();
      onBalancesRefresh?.();
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeployBusy(false);
    }
  };

  const initCodeForUserOp =
    initCalldata && deployed === false
      ? buildInitCodeWithApprovals(aaConfig.accountFactory, initCalldata, approvals)
      : '0x';

  const initCodeDecoded = initCodeForUserOp !== '0x' ? decodeCalldata(initCodeForUserOp) : null;

  const signAndPackUserOp = async (op: PackedUserOp, entryPoint: Contract) =>
    attachWebAuthnSignature(
      { getUserOpHash: (userOp) => entryPoint.getUserOpHash(userOp) as Promise<string> },
      op,
      passkey.signUserOp,
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Passkey account</CardTitle>
          <Button size="sm" onClick={() => void passkey.createPasskey()} disabled={passkey.busy}>
            Create passkey
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Configured: {passkey.configured ? 'yes' : 'no — set VITE_* in .env.local'}</p>
          <p className="font-mono break-all">Address: {passkey.address ?? '—'}</p>
          <p>Deployed: {deployed === null ? '—' : deployed ? 'yes' : 'no (counterfactual)'}</p>
          {passkey.coords && (
            <p className="font-mono text-xs text-muted-foreground">
              qx={passkey.coords.qx.slice(0, 18)}… qy={passkey.coords.qy.slice(0, 18)}…
            </p>
          )}
          {passkey.error && <p className="text-destructive">{passkey.error}</p>}
        </CardContent>
      </Card>

      {passkey.coords && (
        <Card>
          <CardHeader>
            <CardTitle>Creation approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ApprovalEditor value={approvals} onChange={setApprovals} />
            {deployed === false && (
              <>
                <DecodedCalldata decoded={initCodeDecoded} label="First UserOp initCode preview" />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={deployBusy || !passkey.configured}
                    onClick={() => void deployNow()}
                  >
                    {deployBusy ? 'Deploying…' : 'Deploy now (wallet tx)'}
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Or defer deployment — approvals ride in initCode on the first UserOp.
                  </p>
                </div>
                {deployError && <p className="text-destructive text-xs">{deployError}</p>}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <InteractionBuilder
        sender={passkey.address}
        signAndPackUserOp={signAndPackUserOp}
        initCode={initCodeForUserOp}
      />
    </div>
  );
}
