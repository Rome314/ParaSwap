import { useCallback, useState } from 'react';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { aaConfig, type GasToken } from '../../lib/aa/config';
import { env } from '../../config/env';
import {
  estimateUserOperationGas,
  pollUserOperationReceipt,
  sendUserOperation,
  type UserOperationReceipt,
} from '../../lib/aa/bundler';
import { PARASWAP_ABI } from '../../lib/aa/abis';
import {
  buildErc7821ExecuteCalldata,
  buildInitCode,
  buildUserOp,
  attachWebAuthnSignature,
  encodeInitializeWebAuthn,
  ENTRYPOINT_ABI,
  userOpToRpc,
  type PackedUserOp,
} from '../../lib/aa/userOp';

export type PipelineStep = 'build' | 'estimate' | 'sign' | 'submit' | 'inspect';

export interface SwapPreset {
  id: string;
  label: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  gasToken: GasToken;
}

const A7A5 = '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const V3_FEE = 500;

export const SWAP_PRESETS: SwapPreset[] = [
  {
    id: 'a7a5-usdt',
    label: 'A7A5 → USDT (A7A5 gas)',
    tokenIn: A7A5,
    tokenOut: USDT,
    amountIn: 1_000_000_000n,
    gasToken: 'a7a5',
  },
  {
    id: 'usdt-a7a5',
    label: 'USDT → A7A5 (USDT gas)',
    tokenIn: USDT,
    tokenOut: A7A5,
    amountIn: 100_000_000n,
    gasToken: 'usdt',
  },
];

export function useUserOpPipeline(opts: {
  sender: string | null;
  coords: { qx: string; qy: string } | null;
  signUserOp: (hash: string) => Promise<string>;
}) {
  const [step, setStep] = useState<PipelineStep>('build');
  const [op, setOp] = useState<PackedUserOp | null>(null);
  const [estimate, setEstimate] = useState<Record<string, string> | null>(null);
  const [userOpHash, setUserOpHash] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<UserOperationReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const buildSwapCallData = useCallback((preset: SwapPreset) => {
    if (!aaConfig.paraSwap) throw new Error('VITE_PARASWAP not configured');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const swapData = new Interface(PARASWAP_ABI).encodeFunctionData('swap', [
      preset.tokenIn,
      preset.tokenOut,
      preset.amountIn,
      0n,
      V3_FEE,
      deadline,
    ]);
    return buildErc7821ExecuteCalldata(aaConfig.paraSwap, 0n, swapData);
  }, []);

  const build = useCallback(
    async (params: { callData: string; gasToken?: GasToken; deployIfNeeded?: boolean }) => {
      if (!opts.sender) throw new Error('No smart account address');
      setBusy(true);
      setError(null);
      try {
        const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
        const entryPoint = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
        let initCode = '0x';
        if (params.deployIfNeeded !== false && opts.coords) {
          const code = await provider.getCode(opts.sender);
          if (code === '0x') {
            initCode = buildInitCode(
              aaConfig.accountFactory,
              encodeInitializeWebAuthn(opts.coords.qx, opts.coords.qy),
            );
          }
        }
        const unsigned = await buildUserOp(
          provider,
          { getNonce: (s, k) => entryPoint.getNonce(s, k) as Promise<bigint> },
          { sender: opts.sender, callData: params.callData, initCode, gasToken: params.gasToken },
        );
        setOp(unsigned);
        setStep('build');
        return unsigned;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [opts.sender, opts.coords],
  );

  const runEstimate = useCallback(async () => {
    if (!op) throw new Error('Build a UserOp first');
    setBusy(true);
    setError(null);
    try {
      const result = await estimateUserOperationGas(op);
      setEstimate(result);
      setStep('estimate');
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [op]);

  const runSign = useCallback(async () => {
    if (!op) throw new Error('Build a UserOp first');
    setBusy(true);
    setError(null);
    try {
      const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
      const entryPoint = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
      const signed = await attachWebAuthnSignature(
        { getUserOpHash: (userOp) => entryPoint.getUserOpHash(userOp) as Promise<string> },
        op,
        opts.signUserOp,
      );
      setOp(signed);
      setStep('sign');
      return signed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [op, opts.signUserOp]);

  const runSubmit = useCallback(async () => {
    if (!op) throw new Error('Build a UserOp first');
    setBusy(true);
    setError(null);
    try {
      const { userOpHash: hash } = await sendUserOperation(op);
      setUserOpHash(hash);
      setStep('submit');
      const rcpt = await pollUserOperationReceipt(hash);
      setReceipt(rcpt);
      setStep('inspect');
      return { hash, rcpt };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [op]);

  const runPreset = useCallback(
    async (preset: SwapPreset) => {
      const callData = buildSwapCallData(preset);
      await build({ callData, gasToken: preset.gasToken });
    },
    [build, buildSwapCallData],
  );

  const opJson = op ? userOpToRpc(op) : null;

  return {
    step,
    op,
    opJson,
    estimate,
    userOpHash,
    receipt,
    error,
    busy,
    build,
    runEstimate,
    runSign,
    runSubmit,
    runPreset,
    buildSwapCallData,
    presets: SWAP_PRESETS,
  };
}
