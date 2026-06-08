// Minimal ERC-4337 (EntryPoint v0.7/v0.8) helpers shared by scripts and tests.
// Keeps no network handle of its own — callers pass an ethers instance and a connected
// EntryPoint contract, so this works both under `hardhat run` and inside fork tests.

// PackedUserOperation tuple, in the exact field order the EntryPoint ABI expects.
const USER_OP_TUPLE =
  '(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';

/** Minimal EntryPoint ABI: nonce, hashing, execution and stake/deposit management. */
export const ENTRYPOINT_ABI = [
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  `function getUserOpHash(${USER_OP_TUPLE} userOp) view returns (bytes32)`,
  `function handleOps(${USER_OP_TUPLE}[] ops, address beneficiary)`,
  'function depositTo(address account) payable',
  'function balanceOf(address account) view returns (uint256)',
  'function addStake(uint32 unstakeDelaySec) payable',
] as const;

export const ACCOUNT_FACTORY_ABI = [
  'function predictAddress(bytes callData) view returns (address)',
  'function cloneAndInitialize(bytes callData) returns (address)',
  'function getImplementation() view returns (address)',
] as const;

export const WEBAUTHN_ACCOUNT_ABI = [
  'function initializeWebAuthn(bytes32 qx, bytes32 qy)',
  'function execute(bytes32 mode, bytes executionData) payable',
  'function signer() view returns (bytes32 qx, bytes32 qy)',
  'function entryPoint() view returns (address)',
] as const;

// ERC-7821 batch mode: callType=0x01, execType=0x00, zero selectors/payload.
export const ERC7821_BATCH_MODE =
  '0x0100000000000000000000000000000000000000000000000000000000000000' as const;

// A PackedUserOperation as a positional array (what the tuple ABI consumes).
export type PackedUserOp = [
  sender: string,
  nonce: bigint,
  initCode: string,
  callData: string,
  accountGasLimits: string,
  preVerificationGas: bigint,
  gasFees: string,
  paymasterAndData: string,
  signature: string,
];

export type GasToken = 'a7a5' | 'usdt';

export interface PaymasterAddresses {
  a7a5?: string;
  usdt?: string;
}

export interface BuildUserOpParams {
  sender: string;
  callData: string;
  paymaster?: string;
  initCode?: string;
  nonce?: bigint;
  verificationGasLimit?: bigint;
  callGasLimit?: bigint;
  preVerificationGas?: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
}

// `ethers` and the signer types vary between `hardhat run` and the fork test harness,
// so accept them structurally to avoid coupling to one set of generated types.
interface MinimalEthers {
  solidityPacked(types: readonly string[], values: readonly unknown[]): string;
  concat(values: readonly Uint8Array[]): string;
  getBytes(value: string): Uint8Array;
  AbiCoder: {defaultAbiCoder(): {encode(types: string[], values: unknown[]): string}};
  Interface: new (abi: readonly string[]) => {
    encodeFunctionData(name: string, args: unknown[]): string;
    getFunction(name: string): {selector: string};
  };
  provider: {getBlock(tag: string): Promise<{baseFeePerGas?: bigint | null} | null>};
}
interface MinimalSigner {
  signMessage(message: Uint8Array): Promise<string>;
}
interface MinimalEntryPoint {
  getNonce(sender: string, key: bigint): Promise<bigint>;
  getUserOpHash(op: PackedUserOp): Promise<string>;
}

const DEFAULTS = {
  verificationGasLimit: 600_000n,
  callGasLimit: 1_200_000n,
  preVerificationGas: 200_000n,
  paymasterVerificationGasLimit: 500_000n,
  paymasterPostOpGasLimit: 200_000n,
  maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei
};

/** Resolve paymaster address from env or an explicit map. */
export function selectPaymaster(token: GasToken, addresses?: PaymasterAddresses): string | undefined {
  const map = addresses ?? {
    a7a5: process.env.A7A5_PAYMASTER,
    usdt: process.env.USDT_PAYMASTER,
  };
  return map[token];
}

/** Build ERC-4337 initCode: factory (20 bytes) + cloneAndInitialize(calldata). */
export function buildInitCode(
  ethers: MinimalEthers,
  factoryAddress: string,
  initializeCalldata: string,
): string {
  const iface = new ethers.Interface(['function cloneAndInitialize(bytes callData)']);
  const factoryData = iface.encodeFunctionData('cloneAndInitialize', [initializeCalldata]);
  return ethers.solidityPacked(['address', 'bytes'], [factoryAddress, factoryData]);
}

/** Encode initializeWebAuthn(qx, qy) calldata for factory / counterfactual deploy. */
export function encodeInitializeWebAuthn(ethers: MinimalEthers, qx: string, qy: string): string {
  const iface = new ethers.Interface(WEBAUTHN_ACCOUNT_ABI);
  return iface.encodeFunctionData('initializeWebAuthn', [qx, qy]);
}

/** Build ERC-7821 execute(mode, batch) callData for a single target call. */
export function buildErc7821ExecuteCalldata(
  ethers: MinimalEthers,
  target: string,
  value: bigint,
  innerCalldata: string,
): string {
  const executionData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(address target, uint256 value, bytes callData)[]'],
    [[[target, value, innerCalldata]]],
  );
  const iface = new ethers.Interface(WEBAUTHN_ACCOUNT_ABI);
  return iface.encodeFunctionData('execute', [ERC7821_BATCH_MODE, executionData]);
}

/** Build an unsigned PackedUserOperation (signature slot empty). */
export async function buildUserOp(
  ethers: MinimalEthers,
  entryPoint: MinimalEntryPoint,
  params: BuildUserOpParams,
): Promise<PackedUserOp> {
  const verificationGasLimit = params.verificationGasLimit ?? DEFAULTS.verificationGasLimit;
  const callGasLimit = params.callGasLimit ?? DEFAULTS.callGasLimit;
  const preVerificationGas = params.preVerificationGas ?? DEFAULTS.preVerificationGas;
  const pmVerif = params.paymasterVerificationGasLimit ?? DEFAULTS.paymasterVerificationGasLimit;
  const pmPostOp = params.paymasterPostOpGasLimit ?? DEFAULTS.paymasterPostOpGasLimit;
  const maxPriorityFeePerGas = params.maxPriorityFeePerGas ?? DEFAULTS.maxPriorityFeePerGas;

  const block = await ethers.provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? 1_000_000_000n;
  const maxFeePerGas = params.maxFeePerGas ?? baseFee * 2n + maxPriorityFeePerGas;

  const nonce = params.nonce ?? (await entryPoint.getNonce(params.sender, 0n));
  const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [verificationGasLimit, callGasLimit]);
  const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [maxPriorityFeePerGas, maxFeePerGas]);
  const paymasterAndData = params.paymaster
    ? ethers.solidityPacked(['address', 'uint128', 'uint128', 'bytes'], [params.paymaster, pmVerif, pmPostOp, '0x'])
    : '0x';

  return [
    params.sender,
    nonce,
    params.initCode ?? '0x',
    params.callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData,
    '0x',
  ];
}

/**
 * Build a PackedUserOperation and sign it with `owner` over the EntryPoint-computed userOpHash
 * (eth_sign / personal_sign prefix — matches {SimpleA7A5Account}).
 */
export async function buildSignedUserOp(
  ethers: MinimalEthers,
  entryPoint: MinimalEntryPoint,
  owner: MinimalSigner,
  params: BuildUserOpParams,
): Promise<PackedUserOp> {
  const op = await buildUserOp(ethers, entryPoint, params);
  const userOpHash = await entryPoint.getUserOpHash(op);
  op[8] = await owner.signMessage(ethers.getBytes(userOpHash));
  return op;
}

/**
 * Build and sign a PackedUserOperation with a WebAuthn assertion over the EntryPoint userOpHash.
 */
export async function buildWebAuthnSignedUserOp(
  ethers: MinimalEthers,
  entryPoint: MinimalEntryPoint,
  params: BuildUserOpParams,
  signUserOpHash: (userOpHash: string) => string,
): Promise<PackedUserOp> {
  const op = await buildUserOp(ethers, entryPoint, params);
  const userOpHash = await entryPoint.getUserOpHash(op);
  op[8] = signUserOpHash(userOpHash);
  return op;
}
