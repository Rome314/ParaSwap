import type { PackedUserOp } from './userOp';
import { userOpToRpc } from './userOp';
import { aaConfig } from './config';

export interface BundlerSendResult {
  userOpHash: string;
}

export interface UserOperationReceipt {
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  paymaster?: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  reason?: string;
  receipt?: {
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    gasUsed: string;
  };
}

async function bundlerRpc<T>(method: string, params: unknown[]): Promise<T> {
  const url = aaConfig.bundlerUrl;
  if (!url) throw new Error('VITE_BUNDLER_URL is not configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (json.result === undefined) throw new Error(`Bundler returned no result for ${method}`);
  return json.result;
}

export async function sendUserOperation(op: PackedUserOp): Promise<BundlerSendResult> {
  const userOpHash = await bundlerRpc<string>('eth_sendUserOperation', [
    userOpToRpc(op),
    aaConfig.entryPoint,
  ]);
  return { userOpHash };
}

export async function estimateUserOperationGas(op: PackedUserOp): Promise<Record<string, string>> {
  return bundlerRpc<Record<string, string>>('eth_estimateUserOperationGas', [
    userOpToRpc(op),
    aaConfig.entryPoint,
  ]);
}

export async function getSupportedEntryPoints(): Promise<string[]> {
  return bundlerRpc<string[]>('eth_supportedEntryPoints', []);
}

export async function getUserOperationReceipt(
  userOpHash: string,
): Promise<UserOperationReceipt | null> {
  return bundlerRpc<UserOperationReceipt | null>('eth_getUserOperationReceipt', [userOpHash]);
}

export async function pollUserOperationReceipt(
  userOpHash: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<UserOperationReceipt> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const receipt = await getUserOperationReceipt(userOpHash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for UserOp receipt: ${userOpHash}`);
}
