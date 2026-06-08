import { AbiCoder, Interface, solidityPacked } from 'ethers';
import { aaConfig, paymasterFor, type GasToken } from './config';

const USER_OP_TUPLE =
  '(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';

export const ENTRYPOINT_ABI = [
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  `function getUserOpHash(${USER_OP_TUPLE} userOp) view returns (bytes32)`,
] as const;

export const ACCOUNT_FACTORY_ABI = [
  'function predictAddress(bytes callData) view returns (address)',
  'function cloneAndInitialize(bytes callData) returns (address)',
] as const;

export const WEBAUTHN_ACCOUNT_ABI = [
  'function initializeWebAuthn(bytes32 qx, bytes32 qy)',
  'function execute(bytes32 mode, bytes executionData) payable',
] as const;

export const ERC7821_BATCH_MODE =
  '0x0100000000000000000000000000000000000000000000000000000000000000' as const;

export type PackedUserOp = [
  string,
  bigint,
  string,
  string,
  string,
  bigint,
  string,
  string,
  string,
];

const DEFAULTS = {
  verificationGasLimit: 600_000n,
  callGasLimit: 1_200_000n,
  preVerificationGas: 200_000n,
  paymasterVerificationGasLimit: 500_000n,
  paymasterPostOpGasLimit: 200_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
};

export function encodeInitializeWebAuthn(qx: string, qy: string): string {
  const iface = new Interface(WEBAUTHN_ACCOUNT_ABI);
  return iface.encodeFunctionData('initializeWebAuthn', [qx, qy]);
}

export function buildInitCode(factoryAddress: string, initializeCalldata: string): string {
  const iface = new Interface(['function cloneAndInitialize(bytes callData)']);
  const factoryData = iface.encodeFunctionData('cloneAndInitialize', [initializeCalldata]);
  return solidityPacked(['address', 'bytes'], [factoryAddress, factoryData]);
}

export function buildErc7821ExecuteCalldata(target: string, value: bigint, innerCalldata: string): string {
  const executionData = AbiCoder.defaultAbiCoder().encode(
    ['tuple(address target, uint256 value, bytes callData)[]'],
    [[[target, value, innerCalldata]]],
  );
  const iface = new Interface(WEBAUTHN_ACCOUNT_ABI);
  return iface.encodeFunctionData('execute', [ERC7821_BATCH_MODE, executionData]);
}

export interface BuildUserOpParams {
  sender: string;
  callData: string;
  gasToken?: GasToken;
  initCode?: string;
  nonce?: bigint;
}

export async function buildUserOp(
  provider: { getBlock: (tag: string) => Promise<{ baseFeePerGas?: bigint | null } | null> },
  entryPoint: { getNonce: (sender: string, key: bigint) => Promise<bigint> },
  params: BuildUserOpParams,
): Promise<PackedUserOp> {
  const paymaster = params.gasToken ? paymasterFor(params.gasToken) : '';
  const block = await provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? 1_000_000_000n;
  const maxPriorityFeePerGas = DEFAULTS.maxPriorityFeePerGas;
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  const nonce = params.nonce ?? (await entryPoint.getNonce(params.sender, 0n));
  const accountGasLimits = solidityPacked(
    ['uint128', 'uint128'],
    [DEFAULTS.verificationGasLimit, DEFAULTS.callGasLimit],
  );
  const gasFees = solidityPacked(['uint128', 'uint128'], [maxPriorityFeePerGas, maxFeePerGas]);
  const paymasterAndData = paymaster
    ? solidityPacked(
        ['address', 'uint128', 'uint128', 'bytes'],
        [paymaster, DEFAULTS.paymasterVerificationGasLimit, DEFAULTS.paymasterPostOpGasLimit, '0x'],
      )
    : '0x';

  return [
    params.sender,
    nonce,
    params.initCode ?? '0x',
    params.callData,
    accountGasLimits,
    DEFAULTS.preVerificationGas,
    gasFees,
    paymasterAndData,
    '0x',
  ];
}

export function userOpToRpc(op: PackedUserOp) {
  return {
    sender: op[0],
    nonce: `0x${op[1].toString(16)}`,
    initCode: op[2],
    callData: op[3],
    accountGasLimits: op[4],
    preVerificationGas: `0x${op[5].toString(16)}`,
    gasFees: op[6],
    paymasterAndData: op[7],
    signature: op[8],
  };
}

export async function attachWebAuthnSignature(
  entryPoint: { getUserOpHash: (op: PackedUserOp) => Promise<string> },
  op: PackedUserOp,
  signUserOpHash: (hash: string) => Promise<string>,
): Promise<PackedUserOp> {
  const hash = await entryPoint.getUserOpHash(op);
  const sig = await signUserOpHash(hash);
  return [...op.slice(0, 8), sig] as PackedUserOp;
}

export async function predictAccountAddress(
  provider: import('ethers').Provider,
  qx: string,
  qy: string,
  factory = aaConfig.accountFactory,
): Promise<string> {
  const { Contract } = await import('ethers');
  const initCalldata = encodeInitializeWebAuthn(qx, qy);
  const f = new Contract(factory, ACCOUNT_FACTORY_ABI, provider);
  return f.predictAddress(initCalldata) as Promise<string>;
}
