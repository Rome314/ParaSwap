// ---------- fetchRecentEvents ----------

import { Interface } from 'ethers';
import type { ContractEvent } from '../../types/api';
import { getProvider } from './helpers';
import { A7A5_EVENTS_ABI } from './abis';
import { Addresses } from '../../config/addresses';
import { isSupportedChainId, isTronChain } from '../../config/chains';

const EVENTS_IFACE = new Interface(A7A5_EVENTS_ABI);

// Topic hashes for Transfer and Approval — used to filter them out of the event feed
const _ERC20_IFACE = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);
const EXCLUDED_TOPICS = new Set([
  _ERC20_IFACE.getEvent('Transfer')!.topicHash,
  _ERC20_IFACE.getEvent('Approval')!.topicHash,
]);

export async function fetchRecentEvents(
  chainId: number,
  addresses: Addresses,
  blockCount = 200
): Promise<ContractEvent[]> {
  if (isSupportedChainId(chainId) && isTronChain(chainId)) return [];

  const p = getProvider(chainId);
  const latest = await p.getBlockNumber();

  async function fetchLogs(count: number) {
    return p.getLogs({
      address: addresses.A7A5.A7A5,
      fromBlock: Math.max(0, latest - count),
      toBlock: 'latest',
    });
  }

  // Free-tier RPC providers (e.g. Alchemy) cap eth_getLogs at 10 blocks (gap of 9 = 10 inclusive).
  // Try the full range first, fall back to 9 on any block-range error.
  let logs;
  try {
    logs = await fetchLogs(blockCount);
  } catch {
    logs = await fetchLogs(9);
  }

  const events: ContractEvent[] = [];

  for (const log of logs) {
    const topic0 = log.topics[0];
    if (!topic0 || EXCLUDED_TOPICS.has(topic0)) continue;

    try {
      const parsed = EVENTS_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;

      const args: Record<string, string> = {};
      parsed.fragment.inputs.forEach((inp, i) => {
        args[inp.name] = String(parsed.args[i]);
      });

      events.push({
        name: parsed.name,
        args,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      });
    } catch {
      // log belongs to a different event (Transfer/Approval) — skip
    }
  }

  return events.reverse(); // newest first
}
