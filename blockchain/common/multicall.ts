import {Provider} from 'ethers';
import {Interface} from 'ethers/abi';

const MULTICALL3_IFACE = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
]);

type MulticallResult = {success: boolean; returnData: string};

export async function multicall(
  provider: Provider,
  multicall3: string,
  calls: {target: string; fn: string; iface: Interface; args?: unknown[]}[],
): Promise<MulticallResult[]> {
  const encoded = calls.map((c) => ({
    target: c.target,
    allowFailure: true,
    callData: c.iface.encodeFunctionData(c.fn, c.args ?? []),
  }));
  const raw = await provider.call({
    to: multicall3,
    data: MULTICALL3_IFACE.encodeFunctionData('aggregate3', [encoded]),
  });
  const [results] = MULTICALL3_IFACE.decodeFunctionResult('aggregate3', raw) as unknown as [MulticallResult[]];
  return results;
}

export function requireResult(results: MulticallResult[], idx: number, label: string, addr: string): string {
  const r = results[idx];
  if (!r.success || r.returnData === '0x') {
    throw new Error(`${label} call failed at ${addr} — verify the address is correct for this chain`);
  }
  return r.returnData;
}
