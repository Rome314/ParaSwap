// ---------- provider — one instance per chain ID ----------

import { Interface, JsonRpcProvider } from 'ethers';
import { chainRpcURL, isSupportedChainId } from '../../config/chains';
import { MULTICALL3_IFACE } from './abis';

const _providers = new Map<number, JsonRpcProvider>();

export function getProvider(chainId: number): JsonRpcProvider {
  if (!_providers.has(chainId)) {
    const url = isSupportedChainId(chainId) ? chainRpcURL(chainId) : 'http://127.0.0.1:8545';
    // Pass chainId as static network to skip the extra eth_chainId detection round-trip
    _providers.set(chainId, new JsonRpcProvider(url, chainId, { staticNetwork: true }));
  }
  return _providers.get(chainId)!;
}

// ---------- helpers ----------

type MulticallResult = { success: boolean; returnData: string };

export function makeDecoder(results: MulticallResult[]) {
  return function dec(iface: Interface, name: string, idx: number) {
    const r = results[idx];
    if (!r.success || r.returnData === '0x') return null;
    try {
      return iface.decodeFunctionResult(name, r.returnData)[0];
    } catch {
      return null;
    }
  };
}

export async function multicall(
  provider: JsonRpcProvider,
  multicallAddr: string,
  calls: { target: string; allowFailure: boolean; callData: string }[]
): Promise<MulticallResult[]> {
  const encoded = MULTICALL3_IFACE.encodeFunctionData('aggregate3', [calls]);
  const raw = await provider.call({ to: multicallAddr, data: encoded });
  const [results] = MULTICALL3_IFACE.decodeFunctionResult('aggregate3', raw) as unknown as [
    MulticallResult[],
  ];
  return results;
}
