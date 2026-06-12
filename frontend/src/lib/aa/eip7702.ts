// EIP-7702 delegation helpers for the debug dashboard (wallet-first).
//
// Delegation is activated via the connected wallet: a self-sent type-4 transaction with
// authorizationList (and optional ERC-7821 approval batch calldata). UserOps are signed
// separately with eth_signTypedData_v4. Some wallets (e.g. MetaMask) may reject dapp-initiated
// type-4 txs — formatWallet7702Error surfaces actionable guidance when that happens.
import { createPublicClient, http, type Hex, type WalletClient } from 'viem';
import { env } from '../../config/env';
import { hardhatFork } from '../../config/chains';

/** `0xef0100 || delegate` per EIP-7702. */
const DELEGATION_PREFIX = '0xef0100';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function publicClient() {
  return createPublicClient({ chain: hardhatFork, transport: http(env.forkRpcUrl) });
}

/** The delegate address an EOA currently points at, or null when not delegated. */
export async function getDelegation(address: string): Promise<string | null> {
  const code = await publicClient().getCode({ address: address as Hex });
  if (!code || !code.toLowerCase().startsWith(DELEGATION_PREFIX)) return null;
  return `0x${code.slice(DELEGATION_PREFIX.length)}`;
}

export interface DelegateResult {
  txHash: string;
  eoa: string;
}

function requireWalletAccount(walletClient: WalletClient) {
  const account = walletClient.account;
  if (!account) throw new Error('Connect wallet to delegate');
  return account;
}

/**
 * Sign an EIP-7702 authorization with the connected wallet and send a self-addressed type-4 tx.
 * `executeCalldata` (e.g. an ERC-7821 approval batch) runs in the same transaction.
 */
export async function delegateViaWallet(
  walletClient: WalletClient,
  params: { delegate: string; executeCalldata?: string },
): Promise<DelegateResult> {
  const account = requireWalletAccount(walletClient);
  const eoa = account.address;

  const authorization = await walletClient.signAuthorization({
    account,
    contractAddress: params.delegate as Hex,
    executor: 'self',
  });

  const txHash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain ?? hardhatFork,
    to: eoa,
    data: (params.executeCalldata ?? '0x') as Hex,
    authorizationList: [authorization],
  });

  await publicClient().waitForTransactionReceipt({ hash: txHash });
  return { txHash, eoa };
}

/** Point the delegation designator at address(0), disabling the account code. */
export async function revokeViaWallet(walletClient: WalletClient): Promise<DelegateResult> {
  return delegateViaWallet(walletClient, { delegate: ZERO_ADDRESS });
}

/** Ensure the EOA is delegated to the expected implementation; run approval batch on first setup. */
export async function ensureEip7702Ready(params: {
  walletClient: WalletClient;
  address: string;
  expectedDelegate: string;
  approvalCalldata?: string;
}): Promise<void> {
  if (!params.expectedDelegate) {
    throw new Error('EIP-7702 delegate address not configured (VITE_EIP7702_DELEGATE)');
  }

  const current = await getDelegation(params.address);
  if (current?.toLowerCase() === params.expectedDelegate.toLowerCase()) return;

  await delegateViaWallet(params.walletClient, {
    delegate: params.expectedDelegate,
    executeCalldata: params.approvalCalldata,
  });
}

/** Normalize wallet/RPC failures into user-facing delegation errors. */
export function formatWallet7702Error(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Transaction rejected in wallet';
  }
  if (
    lower.includes('authorization') ||
    lower.includes('type 4') ||
    lower.includes('type-4') ||
    lower.includes('eip-7702') ||
    lower.includes('7702') ||
    lower.includes('not supported') ||
    lower.includes('method not found')
  ) {
    return (
      'This wallet does not support EIP-7702 delegation from dapps. ' +
      'Try a wallet that supports type-4 transactions with authorizationList, or switch networks.'
    );
  }
  if (lower.includes('chain') || lower.includes('network')) {
    return `Wrong network — connect to the fork chain. (${raw})`;
  }
  return raw;
}
