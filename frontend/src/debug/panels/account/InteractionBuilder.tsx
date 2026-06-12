import { useMemo, useState } from 'react';
import { Contract, Interface, JsonRpcProvider, parseUnits } from 'ethers';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { env } from '../../../config/env';
import { aaConfig, aaTokens, type GasToken } from '../../../lib/aa/config';
import { PARASWAP_ABI, POOLS_FACADE_ABI } from '../../../lib/aa/abis';
import {
  buildErc7821BatchCalldata,
  buildUserOp,
  ENTRYPOINT_ABI,
  type PackedUserOp,
} from '../../../lib/aa/userOp';
import { sendUserOperation, pollUserOperationReceipt } from '../../../lib/aa/bundler';
import { decodeCalldata } from '../../../lib/aa/decodeCalldata';
import { formatWallet7702Error } from '../../../lib/aa/eip7702';
import { DecodedCalldata } from './components/DecodedCalldata';

type ContractChoice = 'paraswap' | 'poolsFacade';
type GasMode = 'eth-direct' | GasToken;

const V3_FEE = 500;
const FAR_DEADLINE_SEC = 3600;

const PARASWAP_FNS = ['quote', 'swap'] as const;
const POOLS_FNS = [
  'getBestQuoteA7A5PerUSDT',
  'quoteWA7A5PerUSDT',
  'swapA7A5AtBestQuote',
  'swapWA7A5',
] as const;

export interface InteractionBuilderProps {
  sender: string | null;
  /** Whether eth-direct self-call is available (EIP-7702 delegated EOAs). */
  showEthDirect?: boolean;
  /** Sign and return a packed UserOp (passkey path attaches WebAuthn sig internally). */
  signAndPackUserOp: (
    op: PackedUserOp,
    entryPoint: Contract,
  ) => Promise<PackedUserOp>;
  initCode?: string;
  /** Lazy EIP-7702 delegation before first send. */
  ensureReady?: () => Promise<void>;
  connectHint?: string;
}

export function InteractionBuilder({
  sender,
  showEthDirect = false,
  signAndPackUserOp,
  initCode = '0x',
  ensureReady,
  connectHint = 'Connect wallet',
}: InteractionBuilderProps) {
  const [contract, setContract] = useState<ContractChoice>('paraswap');
  const [fnName, setFnName] = useState<string>('swap');
  const [amountIn, setAmountIn] = useState('1000');
  const [side, setSide] = useState('0');
  const [swapDir, setSwapDir] = useState<'a7a5-usdt' | 'usdt-a7a5'>('a7a5-usdt');
  const [gasMode, setGasMode] = useState<GasMode>('a7a5');
  const [builtCalldata, setBuiltCalldata] = useState<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{ hash: string; success: boolean } | null>(null);

  const { sendTransactionAsync } = useSendTransaction();
  const [ethDirectHash, setEthDirectHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: ethDirectSuccess, isError: ethDirectError } = useWaitForTransactionReceipt({
    hash: ethDirectHash,
  });

  const fnOptions = contract === 'paraswap' ? PARASWAP_FNS : POOLS_FNS;
  const isQuote = fnName.startsWith('quote') || fnName.startsWith('getBest');

  const decoded = useMemo(
    () => (builtCalldata ? decodeCalldata(builtCalldata, sender ?? undefined) : null),
    [builtCalldata, sender],
  );

  const provider = useMemo(
    () => new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true }),
    [],
  );

  const buildInnerCalldata = (): string => {
    const amount = parseUnits(amountIn, 6);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + FAR_DEADLINE_SEC);

    if (contract === 'paraswap') {
      const tokenIn = swapDir === 'a7a5-usdt' ? aaTokens.a7a5 : aaTokens.usdt;
      const tokenOut = swapDir === 'a7a5-usdt' ? aaTokens.usdt : aaTokens.a7a5;
      const iface = new Interface(PARASWAP_ABI);
      if (fnName === 'quote') {
        return iface.encodeFunctionData('quote', [tokenIn, tokenOut, amount, V3_FEE]);
      }
      return iface.encodeFunctionData('swap', [tokenIn, tokenOut, amount, 0n, V3_FEE, deadline]);
    }

    const iface = new Interface(POOLS_FACADE_ABI);
    const sideNum = Number(side);
    if (fnName === 'getBestQuoteA7A5PerUSDT') {
      return iface.encodeFunctionData('getBestQuoteA7A5PerUSDT', [amount, sideNum]);
    }
    if (fnName === 'quoteWA7A5PerUSDT') {
      return iface.encodeFunctionData('quoteWA7A5PerUSDT', [amount, sideNum]);
    }
    if (fnName === 'swapA7A5AtBestQuote') {
      return iface.encodeFunctionData('swapA7A5AtBestQuote', [amount, sideNum, 0n, deadline]);
    }
    return iface.encodeFunctionData('swapWA7A5', [amount, sideNum, 0n, deadline]);
  };

  const buildPayload = () => {
    try {
      setError(null);
      setQuoteResult(null);
      const inner = buildInnerCalldata();
      const target =
        contract === 'paraswap' ? aaConfig.paraSwap : aaConfig.poolsFacade;
      if (!target) throw new Error('Contract address not configured');

      if (isQuote) {
        setBuiltCalldata(inner);
        return;
      }

      const batch = buildErc7821BatchCalldata([{ target, value: 0n, calldata: inner }]);
      setBuiltCalldata(batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBuiltCalldata(null);
    }
  };

  const runQuote = async () => {
    if (!builtCalldata || !isQuote) return;
    setBusy(true);
    setError(null);
    try {
      const target =
        contract === 'paraswap' ? aaConfig.paraSwap : aaConfig.poolsFacade;
      const raw = await provider.call({ to: target, data: builtCalldata });
      const iface = new Interface(contract === 'paraswap' ? PARASWAP_ABI : POOLS_FACADE_ABI);
      const parsed = iface.parseTransaction({ data: builtCalldata });
      if (!parsed) throw new Error('Failed to parse quote calldata');
      const decodedResult = iface.decodeFunctionResult(parsed.name, raw);
      setQuoteResult(
        Array.isArray(decodedResult)
          ? decodedResult.map((v) => (typeof v === 'bigint' ? v.toString() : String(v))).join(', ')
          : String(decodedResult),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendPayload = async () => {
    if (!sender || !builtCalldata || isQuote) return;
    setBusy(true);
    setError(null);
    setTxResult(null);
    setEthDirectHash(undefined);
    try {
      if (ensureReady) {
        await ensureReady();
      }

      if (gasMode === 'eth-direct') {
        if (!showEthDirect) throw new Error('Eth-direct is only available for delegated EIP-7702 accounts');
        const hash = await sendTransactionAsync({
          to: sender as `0x${string}`,
          data: builtCalldata as `0x${string}`,
        });
        setEthDirectHash(hash);
        setTxResult({ hash, success: true });
        return;
      }

      const entryPoint = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
      const op = await buildUserOp(
        provider,
        { getNonce: (s, k) => entryPoint.getNonce(s, k) as Promise<bigint> },
        { sender, callData: builtCalldata, initCode, gasToken: gasMode },
      );
      const signed = await signAndPackUserOp(op, entryPoint);
      const { userOpHash } = await sendUserOperation(signed);
      const receipt = await pollUserOperationReceipt(userOpHash);
      setTxResult({ hash: userOpHash, success: receipt.success });
    } catch (e) {
      setError(ensureReady ? formatWallet7702Error(e) : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canSend = Boolean(sender && builtCalldata && !isQuote && decoded);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interaction builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sender && (
          <p className="text-muted-foreground text-xs">{connectHint}</p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            Contract
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-xs"
              value={contract}
              onChange={(e) => {
                const c = e.target.value as ContractChoice;
                setContract(c);
                setFnName(c === 'paraswap' ? 'swap' : 'getBestQuoteA7A5PerUSDT');
                setBuiltCalldata(null);
              }}
            >
              <option value="paraswap">ParaSwap</option>
              <option value="poolsFacade">PoolsFacade</option>
            </select>
          </label>
          <label className="block text-sm">
            Function
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-xs"
              value={fnName}
              onChange={(e) => {
                setFnName(e.target.value);
                setBuiltCalldata(null);
              }}
            >
              {fnOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>

        {contract === 'paraswap' && !isQuote && (
          <label className="block text-sm">
            Direction
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-xs"
              value={swapDir}
              onChange={(e) => setSwapDir(e.target.value as 'a7a5-usdt' | 'usdt-a7a5')}
            >
              <option value="a7a5-usdt">A7A5 → USDT</option>
              <option value="usdt-a7a5">USDT → A7A5</option>
            </select>
          </label>
        )}

        {contract === 'poolsFacade' && (
          <label className="block text-sm">
            Side (0=BUY USDT in, 1=SELL A7A5/wA7A5 in)
            <input
              className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
              value={side}
              onChange={(e) => setSide(e.target.value)}
            />
          </label>
        )}

        <label className="block text-sm">
          Amount (human, 6 decimals)
          <input
            className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
        </label>

        {!isQuote && (
          <label className="block text-sm">
            Gas payment
            <select
              className="mt-1 w-full rounded border px-2 py-1 text-xs"
              value={gasMode}
              onChange={(e) => setGasMode(e.target.value as GasMode)}
            >
              {showEthDirect && (
                <option value="eth-direct">ETH direct (type-2 self-call)</option>
              )}
              <option value="a7a5">A7A5 paymaster (UserOp)</option>
              <option value="usdt">USDT paymaster (UserOp)</option>
            </select>
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={buildPayload}>
            Build calldata
          </Button>
          {isQuote && builtCalldata && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runQuote()}>
              Run quote (eth_call)
            </Button>
          )}
          {!isQuote && (
            <Button size="sm" disabled={!canSend || busy} onClick={() => void sendPayload()}>
              {busy ? 'Sending…' : 'Sign & send'}
            </Button>
          )}
        </div>

        {quoteResult && <p className="text-xs text-green-700">Quote: {quoteResult}</p>}
        {error && <p className="text-destructive text-xs">{error}</p>}
        {txResult && (
          <p className={txResult.success ? 'text-green-600 text-xs' : 'text-destructive text-xs'}>
            {txResult.success ? 'Success' : 'Reverted'} · {txResult.hash.slice(0, 18)}…
            {ethDirectHash && ethDirectSuccess && ' (confirmed)'}
            {ethDirectHash && ethDirectError && ' (failed)'}
          </p>
        )}

        <DecodedCalldata decoded={decoded} label="Decoded preview" />

        {builtCalldata && (
          <pre className="overflow-auto rounded bg-muted p-2 text-xs break-all max-h-24">{builtCalldata}</pre>
        )}
      </CardContent>
    </Card>
  );
}
