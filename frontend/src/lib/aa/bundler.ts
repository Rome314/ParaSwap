import type { PackedUserOp } from './userOp';
import { userOpToRpc } from './userOp';
import { aaConfig } from './config';

export interface BundlerSendResult {
  userOpHash: string;
}

export async function sendUserOperation(op: PackedUserOp): Promise<BundlerSendResult> {
  const url = aaConfig.bundlerUrl;
  if (!url) throw new Error('VITE_BUNDLER_URL is not configured');

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendUserOperation',
    params: [userOpToRpc(op), aaConfig.entryPoint],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error('Bundler returned no userOpHash');
  return { userOpHash: json.result };
}

export async function estimateUserOperationGas(op: PackedUserOp): Promise<Record<string, string>> {
  const url = aaConfig.bundlerUrl;
  if (!url) throw new Error('VITE_BUNDLER_URL is not configured');

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_estimateUserOperationGas',
    params: [userOpToRpc(op), aaConfig.entryPoint],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result?: Record<string, string>; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? {};
}
