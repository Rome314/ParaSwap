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

export interface BuildUserOpParams {
  sender: string;
  callData: string;
  paymaster?: string;
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
  getBytes(value: string): Uint8Array;
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

/**
 * Build a PackedUserOperation and sign it with `owner` over the EntryPoint-computed userOpHash
 * (eth_sign / personal_sign prefix — matches {SimpleA7A5Account}). Reading the hash from the live
 * EntryPoint keeps signing correct across EntryPoint versions.
 */
export async function buildSignedUserOp(
  ethers: MinimalEthers,
  entryPoint: MinimalEntryPoint,
  owner: MinimalSigner,
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

  const nonce = await entryPoint.getNonce(params.sender, 0n);
  const accountGasLimits = ethers.solidityPacked(['uint128', 'uint128'], [verificationGasLimit, callGasLimit]);
  const gasFees = ethers.solidityPacked(['uint128', 'uint128'], [maxPriorityFeePerGas, maxFeePerGas]);
  const paymasterAndData = params.paymaster
    ? ethers.solidityPacked(['address', 'uint128', 'uint128', 'bytes'], [params.paymaster, pmVerif, pmPostOp, '0x'])
    : '0x';

  const op: PackedUserOp = [params.sender, nonce, '0x', params.callData, accountGasLimits, preVerificationGas, gasFees, paymasterAndData, '0x'];

  const userOpHash = await entryPoint.getUserOpHash(op);
  op[8] = await owner.signMessage(ethers.getBytes(userOpHash));
  return op;
}
