// Recursive calldata decoder for the debug dashboard: resolves a hex payload against the
// known protocol ABIs and unwraps nested ERC-7821 execute batches and handleOps UserOps,
// so every outgoing transaction can be shown fully decoded before it is sent.
import { AbiCoder, Interface, type TransactionDescription } from 'ethers';
import { ENTRYPOINT_EXTENDED_ABI, ERC20_ABI, PARASWAP_ABI, POOLS_FACADE_ABI } from './abis';
import { ACCOUNT_FACTORY_ABI, WEBAUTHN_ACCOUNT_ABI } from './userOp';
import { aaConfig, aaTokens } from './config';

export interface DecodedArg {
  name: string;
  type: string;
  value: string;
}

export interface DecodedCall {
  /** Call target when known (inner batch calls always have one). */
  to?: string;
  value?: bigint;
  contractName?: string;
  functionName?: string;
  signature?: string;
  selector?: string;
  args: DecodedArg[];
  /** Inner calls of an ERC-7821 batch / handleOps user operations. */
  children?: DecodedCall[];
  raw: string;
}

const REGISTRY: { name: string; iface: Interface }[] = [
  { name: 'SmartAccount', iface: new Interface(WEBAUTHN_ACCOUNT_ABI) },
  { name: 'EntryPoint', iface: new Interface(ENTRYPOINT_EXTENDED_ABI) },
  { name: 'AccountFactory', iface: new Interface(ACCOUNT_FACTORY_ABI) },
  { name: 'ParaSwap', iface: new Interface(PARASWAP_ABI) },
  { name: 'PoolsFacade', iface: new Interface(POOLS_FACADE_ABI) },
  { name: 'ERC20', iface: new Interface(ERC20_ABI) },
];

/** Human label for well-known protocol addresses. */
export function labelForAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const a = address.toLowerCase();
  const known: Record<string, string> = {
    [aaTokens.a7a5]: 'A7A5',
    [aaTokens.wa7a5]: 'WA7A5',
    [aaTokens.usdt]: 'USDT',
    [aaConfig.paraSwap]: 'ParaSwap',
    [aaConfig.poolsFacade]: 'PoolsFacade',
    [aaConfig.a7a5Paymaster]: 'A7A5Paymaster',
    [aaConfig.usdtPaymaster]: 'UsdtPaymaster',
    [aaConfig.entryPoint]: 'EntryPoint',
    [aaConfig.accountFactory]: 'AccountFactory',
    [aaConfig.eip7702Delegate]: 'EIP7702Delegate',
  };
  return known[a];
}

function stringify(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(stringify).join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return String(value);
}

function toArgs(parsed: TransactionDescription): DecodedArg[] {
  return parsed.fragment.inputs.map((input, i) => ({
    name: input.name || `arg${i}`,
    type: input.type,
    value: stringify(parsed.args[i]),
  }));
}

function parseWithRegistry(data: string): { name: string; parsed: TransactionDescription } | null {
  for (const { name, iface } of REGISTRY) {
    try {
      const parsed = iface.parseTransaction({ data });
      if (parsed) return { name, parsed };
    } catch {
      // not this ABI — try the next one
    }
  }
  return null;
}

/**
 * Decode calldata against the known protocol ABIs, recursing into ERC-7821
 * `execute(mode, executionData)` batches and EntryPoint `handleOps` operations.
 */
export function decodeCalldata(data: string, to?: string, value = 0n): DecodedCall {
  const base: DecodedCall = { to, value, raw: data, args: [] };
  if (!data || data === '0x') {
    return { ...base, functionName: value > 0n ? 'ETH transfer' : '(empty calldata)' };
  }

  const match = parseWithRegistry(data);
  if (!match) {
    return { ...base, selector: data.slice(0, 10), functionName: '(unknown selector)' };
  }

  const { name, parsed } = match;
  const decoded: DecodedCall = {
    ...base,
    contractName: labelForAddress(to) ?? name,
    functionName: parsed.name,
    signature: parsed.signature,
    selector: parsed.selector,
    args: toArgs(parsed),
  };

  if (parsed.name === 'execute') {
    try {
      const [batch] = AbiCoder.defaultAbiCoder().decode(
        ['tuple(address target, uint256 value, bytes callData)[]'],
        parsed.args[1],
      ) as unknown as [{ target: string; value: bigint; callData: string }[]];
      decoded.children = batch.map((call) =>
        decodeCalldata(call.callData, call.target, call.value),
      );
    } catch {
      // executionData not in batch layout — leave undecoded
    }
  }

  if (parsed.name === 'handleOps') {
    // The EntryPoint ABI declares PackedUserOperation as an unnamed tuple — use positions.
    const ops = parsed.args[0] as unknown as [string, bigint, string, string][];
    decoded.children = ops.map((op) => decodeCalldata(op[3], op[0]));
  }

  if (parsed.name === 'cloneAndInitializeWithApprovals' || parsed.name === 'cloneAndInitialize') {
    decoded.children = [decodeCalldata(parsed.args[0] as string)];
  }

  return decoded;
}
