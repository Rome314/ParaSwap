import { useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount';
import { env } from '../../config/env';
import { aaConfig } from '../../lib/aa/config';
import { ERC20_ABI } from '../../lib/aa/abis';
import { buildErc7821ExecuteCalldata, ENTRYPOINT_ABI } from '../../lib/aa/userOp';
import { formatTokenAmount } from '../../lib/aa/decode';

const A7A5 = '0x6fA0BE17e4beA2fCfA22ef89BF8ac9aab0AB0fc9';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

export function SmartAccountPanel() {
  const passkey = usePasskeyAccount();
  const [deployed, setDeployed] = useState<boolean | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [target, setTarget] = useState('');
  const [value, setValue] = useState('0');
  const [calldata, setCalldata] = useState('0x');
  const [rawExecute, setRawExecute] = useState('');

  useEffect(() => {
    void passkey.refreshAddress();
  }, [passkey]);

  const refreshOnChain = async () => {
    if (!passkey.address) return;
    const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
    const code = await provider.getCode(passkey.address);
    setDeployed(code !== '0x');

    const ep = new Contract(aaConfig.entryPoint, ENTRYPOINT_ABI, provider);
    const n = (await ep.getNonce(passkey.address, 0)) as bigint;
    setNonce(n.toString());

    const ethBal = await provider.getBalance(passkey.address);
    const a7a5 = new Contract(A7A5, ERC20_ABI, provider);
    const usdt = new Contract(USDT, ERC20_ABI, provider);
    const [a7a5Bal, usdtBal] = await Promise.all([
      a7a5.balanceOf(passkey.address) as Promise<bigint>,
      usdt.balanceOf(passkey.address) as Promise<bigint>,
    ]);
    setBalances({
      ETH: formatTokenAmount(ethBal, 18, 'ETH'),
      A7A5: formatTokenAmount(a7a5Bal, 6, 'A7A5'),
      USDT: formatTokenAmount(usdtBal, 6, 'USDT'),
    });
  };

  useEffect(() => {
    void refreshOnChain();
  }, [passkey.address]);

  const previewExecute = () => {
    try {
      const data = buildErc7821ExecuteCalldata(target, BigInt(value), calldata);
      setRawExecute(data);
    } catch (e) {
      setRawExecute(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Passkey account</CardTitle>
          <Button size="sm" onClick={() => void passkey.createPasskey()} disabled={passkey.busy}>
            Create passkey
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Configured: {passkey.configured ? 'yes' : 'no — set VITE_* in .env.local'}</p>
          <p className="font-mono break-all">Address: {passkey.address ?? '—'}</p>
          <p>Deployed: {deployed === null ? '—' : deployed ? 'yes' : 'no (counterfactual)'}</p>
          <p>Nonce: {nonce ?? '—'}</p>
          {passkey.coords && (
            <p className="font-mono text-xs text-muted-foreground">
              qx={passkey.coords.qx.slice(0, 18)}… qy={passkey.coords.qy.slice(0, 18)}…
            </p>
          )}
          {passkey.error && <p className="text-destructive">{passkey.error}</p>}
          <Button size="sm" variant="outline" onClick={() => void refreshOnChain()}>
            Refresh on-chain
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {Object.entries(balances).map(([sym, bal]) => (
            <p key={sym}>
              {sym}: {bal}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw execute (ERC-7821)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="block text-sm">
            Target
            <input
              className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <label className="block text-sm">
            Value (wei)
            <input
              className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Calldata
            <input
              className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
              value={calldata}
              onChange={(e) => setCalldata(e.target.value)}
            />
          </label>
          <Button size="sm" variant="outline" onClick={previewExecute}>
            Preview callData
          </Button>
          {rawExecute && (
            <pre className="overflow-auto rounded bg-muted p-2 text-xs break-all">{rawExecute}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
