import { useCallback, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount } from 'wagmi';
import { getProvider } from '../lib/a7a5/helpers';
import { sendUserOperation } from '../lib/aa/bundler';
import type { GasToken } from '../lib/aa/config';
import {
  ENTRYPOINT_ABI,
  buildErc7821ExecuteCalldata,
  buildInitCode,
  buildUserOp,
  attachWebAuthnSignature,
  encodeInitializeWebAuthn,
  predictAccountAddress,
  type PackedUserOp,
} from '../lib/aa/userOp';
import { aaConfig } from '../lib/aa/config';
import { usePasskeyAccount } from './usePasskeyAccount';

export interface SponsoredSwapParams {
  target: string;
  calldata: string;
  value?: bigint;
  gasToken: GasToken;
  deployIfNeeded?: boolean;
}

export function useSponsoredSwap() {
  const { chainId } = useAccount();
  const passkey = usePasskeyAccount();
  const [pending, setPending] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (params: SponsoredSwapParams) => {
      if (!chainId) throw new Error('Connect wallet to select chain');
      if (!passkey.coords) throw new Error('Register a passkey first');
      const provider = getProvider(chainId);
      const entryPointContract = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
      const entryPoint = {
        getNonce: (sender: string, key: bigint) =>
          entryPointContract.getNonce(sender, key) as Promise<bigint>,
        getUserOpHash: (op: PackedUserOp) => entryPointContract.getUserOpHash(op) as Promise<string>,
      };

      const sender =
        passkey.address ??
        (passkey.coords
          ? await predictAccountAddress(provider, passkey.coords.qx, passkey.coords.qy)
          : null);

      if (!sender) throw new Error('Could not resolve smart account address');

      const callData = buildErc7821ExecuteCalldata(params.target, params.value ?? 0n, params.calldata);

      let initCode = '0x';
      const code = await provider.getCode(sender);
      if (code === '0x' && params.deployIfNeeded !== false) {
        const initCalldata = encodeInitializeWebAuthn(passkey.coords.qx, passkey.coords.qy);
        initCode = buildInitCode(aaConfig.accountFactory, initCalldata);
      }

      setPending(true);
      setError(null);
      try {
        let op = await buildUserOp(provider, entryPoint, {
          sender,
          callData,
          initCode,
          gasToken: params.gasToken,
        });
        op = await attachWebAuthnSignature(entryPoint, op, passkey.signUserOp);
        const { userOpHash } = await sendUserOperation(op);
        setLastHash(userOpHash);
        return userOpHash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [chainId, passkey],
  );

  return { execute, pending, lastHash, error };
}
