// EntryPoint v0.8 computes userOpHash as an EIP-712 digest, so EOA-signer accounts
// (EIP-7702) can sign UserOps with eth_signTypedData_v4 in a browser wallet, and
// OZ SignerEIP7702 (raw ECDSA recover against address(this)) accepts the signature.
import { getAddress, TypedDataEncoder, Wallet } from 'ethers';
import { aaConfig } from './config';
import type { PackedUserOp } from './userOp';

export interface UserOpTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: 'PackedUserOperation';
  message: Record<string, unknown>;
}

export const PACKED_USER_OP_TYPED_DATA_TYPES: Record<string, { name: string; type: string }[]> = {
  PackedUserOperation: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' },
  ],
};

export function userOpToTypedData(op: PackedUserOp, chainId = 1): UserOpTypedData {
  return {
    domain: {
      name: 'ERC4337',
      version: '1',
      chainId,
      // Some wallets reject lowercased addresses in typed-data payloads.
      verifyingContract: getAddress(aaConfig.entryPoint.toLowerCase()),
    },
    types: PACKED_USER_OP_TYPED_DATA_TYPES,
    primaryType: 'PackedUserOperation',
    message: {
      sender: getAddress(op[0].toLowerCase()),
      nonce: op[1],
      initCode: op[2],
      callData: op[3],
      accountGasLimits: op[4],
      preVerificationGas: op[5],
      gasFees: op[6],
      paymasterAndData: op[7],
    },
  };
}

export function computeTypedDataHash(op: PackedUserOp, chainId = 1): string {
  const { domain, types, message } = userOpToTypedData(op, chainId);
  return TypedDataEncoder.hash(domain, types, message);
}

/**
 * Guard against silent signature mismatches: the locally-computed EIP-712 digest must equal
 * the EntryPoint's userOpHash, otherwise handleOps would fail late with an opaque AA24 error.
 */
export async function assertUserOpHashMatches(
  entryPoint: { getUserOpHash: (op: PackedUserOp) => Promise<string> },
  op: PackedUserOp,
  chainId = 1,
): Promise<string> {
  const expected = await entryPoint.getUserOpHash(op);
  const local = computeTypedDataHash(op, chainId);
  if (local.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `Typed-data hash mismatch: local ${local} vs EntryPoint ${expected} — check domain/chainId`,
    );
  }
  return expected;
}

/** Sign the UserOp typed data with a raw private key (dev/anvil accounts). */
export async function signUserOpWithDevKey(
  op: PackedUserOp,
  privateKey: string,
  chainId = 1,
): Promise<string> {
  const { domain, types, message } = userOpToTypedData(op, chainId);
  return new Wallet(privateKey).signTypedData(domain, types, message);
}

// Wagmi's signTypedDataAsync uses branded address types — keep this loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignTypedDataFn = (args: any) => Promise<string>;

/** Sign via RainbowKit/wagmi typed-data, or fall back to a dev private key. */
export async function signUserOpTypedData(
  op: PackedUserOp,
  signTypedDataAsync: SignTypedDataFn | undefined,
  devPrivateKey: string | undefined,
  chainId = 1,
): Promise<string> {
  const td = userOpToTypedData(op, chainId);
  if (signTypedDataAsync) {
    return signTypedDataAsync({
      domain: td.domain,
      types: td.types,
      primaryType: td.primaryType,
      message: td.message,
    });
  }
  if (devPrivateKey) {
    return signUserOpWithDevKey(op, devPrivateKey, chainId);
  }
  throw new Error('Connect a wallet or select a dev key to sign UserOps');
}

/** Attach an EIP-712 signature to a UserOp after hash verification. */
export async function attachTypedDataSignature(
  entryPoint: { getUserOpHash: (op: PackedUserOp) => Promise<string> },
  op: PackedUserOp,
  signature: string,
  chainId = 1,
): Promise<PackedUserOp> {
  await assertUserOpHashMatches(entryPoint, op, chainId);
  return [...op.slice(0, 8), signature] as PackedUserOp;
}

/** Build a signed UserOp for EIP-7702 EOAs via connected wallet typed-data. */
export async function packEip7702UserOp(
  op: PackedUserOp,
  entryPoint: { getUserOpHash: (op: PackedUserOp) => Promise<string> },
  signTypedDataAsync: SignTypedDataFn | undefined,
  chainId = 1,
): Promise<PackedUserOp> {
  if (!signTypedDataAsync) {
    throw new Error('Connect wallet to sign UserOps');
  }
  const sig = await signUserOpTypedData(op, signTypedDataAsync, undefined, chainId);
  return attachTypedDataSignature(entryPoint, op, sig, chainId);
}
