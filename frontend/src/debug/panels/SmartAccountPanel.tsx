import { useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { env } from '../../config/env';
import { aaTokens } from '../../lib/aa/config';
import { ERC20_ABI } from '../../lib/aa/abis';
import { formatTokenAmount } from '../../lib/aa/decode';
import { PasskeyAccountSection } from './account/PasskeyAccountSection';
import { Eip7702AccountSection } from './account/Eip7702AccountSection';
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount';
import { useEip7702Account } from '../hooks/useEip7702Account';

type AccountType = 'passkey' | 'eip7702';

const A7A5 = aaTokens.a7a5;
const USDT = aaTokens.usdt;

export function SmartAccountPanel() {
  const [accountType, setAccountType] = useState<AccountType>('passkey');
  const passkey = usePasskeyAccount();
  const eip7702 = useEip7702Account();
  const [balances, setBalances] = useState<Record<string, string>>({});

  const activeAddress = accountType === 'passkey' ? passkey.address : eip7702.address;

  const refreshBalances = async () => {
    if (!activeAddress) return;
    const provider = new JsonRpcProvider(env.forkRpcUrl, 1, { staticNetwork: true });
    const ethBal = await provider.getBalance(activeAddress);
    const a7a5 = new Contract(A7A5, ERC20_ABI, provider);
    const usdt = new Contract(USDT, ERC20_ABI, provider);
    const [a7a5Bal, usdtBal] = await Promise.all([
      a7a5.balanceOf(activeAddress) as Promise<bigint>,
      usdt.balanceOf(activeAddress) as Promise<bigint>,
    ]);
    setBalances({
      ETH: formatTokenAmount(ethBal, 18, 'ETH'),
      A7A5: formatTokenAmount(a7a5Bal, 6, 'A7A5'),
      USDT: formatTokenAmount(usdtBal, 6, 'USDT'),
    });
  };

  useEffect(() => {
    void refreshBalances();
  }, [activeAddress]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Account type</CardTitle>
          <div className="flex rounded border overflow-hidden text-sm">
            <button
              type="button"
              className={`px-3 py-1 ${accountType === 'passkey' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setAccountType('passkey')}
            >
              Passkey (ERC-4337)
            </button>
            <button
              type="button"
              className={`px-3 py-1 ${accountType === 'eip7702' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setAccountType('eip7702')}
            >
              EIP-7702 EOA
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-mono break-all">Active: {activeAddress ?? '—'}</p>
          {accountType === 'eip7702' && !eip7702.isConnected && (
            <p className="text-muted-foreground text-xs">
              Connect wallet in the header — your EIP-7702 smart account address is your wallet address.
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => void refreshBalances()}>
            Refresh balances
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
          {!activeAddress && (
            <p className="text-muted-foreground">
              {accountType === 'eip7702'
                ? 'Connect wallet to view balances'
                : 'Select or create an account'}
            </p>
          )}
        </CardContent>
      </Card>

      {accountType === 'passkey' ? (
        <PasskeyAccountSection onBalancesRefresh={() => void refreshBalances()} />
      ) : (
        <Eip7702AccountSection onBalancesRefresh={() => void refreshBalances()} />
      )}
    </div>
  );
}
