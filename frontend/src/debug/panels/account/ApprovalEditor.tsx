import { useEffect, useState } from 'react';
import { Button } from '@openzeppelin/ui-components';
import { aaTokens } from '../../../lib/aa/config';
import { defaultApprovals, MAX_UINT256, type TokenApproval } from '../../../lib/aa/userOp';
import { labelForAddress } from '../../../lib/aa/decodeCalldata';

function tokenLabel(addr: string): string {
  const a = addr.toLowerCase();
  if (a === aaTokens.a7a5) return 'A7A5';
  if (a === aaTokens.wa7a5) return 'WA7A5';
  if (a === aaTokens.usdt) return 'USDT';
  return shortenAddr(addr);
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

function parseAmount(raw: string): bigint {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'max') return MAX_UINT256;
  return BigInt(trimmed);
}

function formatAmount(amount: bigint): string {
  return amount === MAX_UINT256 ? 'max' : amount.toString();
}

export interface ApprovalEditorProps {
  value: TokenApproval[];
  onChange: (approvals: TokenApproval[]) => void;
}

export function ApprovalEditor({ value, onChange }: ApprovalEditorProps) {
  const [amounts, setAmounts] = useState<string[]>(() => value.map((a) => formatAmount(a.amount)));

  useEffect(() => {
    setAmounts(value.map((a) => formatAmount(a.amount)));
  }, [value]);

  const updateAmount = (index: number, raw: string) => {
    const next = [...amounts];
    next[index] = raw;
    setAmounts(next);
    const updated = value.map((a, i) =>
      i === index ? { ...a, amount: parseAmount(raw) } : a,
    );
    onChange(updated);
  };

  const resetDefaults = () => {
    const defs = defaultApprovals();
    onChange(defs);
    setAmounts(defs.map((a) => formatAmount(a.amount)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Creation-time approvals ({value.length})</p>
        <Button size="sm" variant="outline" onClick={resetDefaults}>
          Reset defaults
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1 pr-2">Token</th>
              <th className="py-1 pr-2">Spender</th>
              <th className="py-1">Amount (wei or &quot;max&quot;)</th>
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={`${row.token}-${row.spender}`} className="border-b border-border/50">
                <td className="py-1 pr-2 font-mono">{tokenLabel(row.token)}</td>
                <td className="py-1 pr-2 font-mono">
                  {labelForAddress(row.spender) ?? shortenAddr(row.spender)}
                </td>
                <td className="py-1">
                  <input
                    className="w-full rounded border px-2 py-0.5 font-mono"
                    value={amounts[i] ?? ''}
                    onChange={(e) => updateAmount(i, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
