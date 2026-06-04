import { useState } from 'react';
import { Btn, Inp } from '../ui/ui';

export interface TokenQueryResult {
  balance: string;
  shares?: string;
  blacklisted: boolean;
}

interface TokenPickerProps {
  options: Array<{ id: string; label: string; color: string }>;
  selected: string;
  onChange: (id: string) => void;
}

interface TokenActionsPanelProps {
  tabLabels: { transfer: string; approve: string; query: string };
  tokenPicker?: TokenPickerProps;
  transfer: {
    desc: string;
    toPlaceholder: string;
    amtPlaceholder: string;
    sendBtn: string;
    feePreview?: (amount: string) => React.ReactNode;
  };
  approve: {
    desc: string;
    spenderPlaceholder: string;
    amtPlaceholder: string;
    approveBtn: string;
  };
  query: {
    desc: string;
    placeholder: string;
    queryBtn: string;
    queryingText: string;
  };
  resultLabels: {
    balanceOf: string;
    sharesOf?: string;
    blacklistedLabel: string;
    yes: string;
    no: string;
  };
  onTransfer: (to: string, amount: string) => Promise<boolean>;
  onApprove: (spender: string, amount: string) => Promise<boolean>;
  onQuery: (addr: string) => Promise<TokenQueryResult | null>;
}

export function TokenActionsPanel({
  tabLabels,
  tokenPicker,
  transfer,
  approve,
  query,
  resultLabels,
  onTransfer,
  onApprove,
  onQuery,
}: TokenActionsPanelProps) {
  const [activeTab, setActiveTab] = useState<'transfer' | 'approve' | 'query'>('transfer');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmt, setTransferAmt] = useState('');
  const [approveSpender, setApproveSpender] = useState('');
  const [approveAmt, setApproveAmt] = useState('');
  const [queryAddr, setQueryAddr] = useState('');
  const [queryResult, setQueryResult] = useState<TokenQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleTransfer() {
    setBusy(true);
    try {
      const ok = await onTransfer(transferTo, transferAmt);
      if (ok) {
        setTransferTo('');
        setTransferAmt('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const ok = await onApprove(approveSpender, approveAmt);
      if (ok) {
        setApproveSpender('');
        setApproveAmt('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleQuery() {
    setQueryLoading(true);
    setQueryResult(null);
    const result = await onQuery(queryAddr);
    setQueryResult(result);
    setQueryLoading(false);
  }

  return (
    <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
      {/* Token picker */}
      {tokenPicker && (
        <div className="mb-4 flex gap-1.5">
          {tokenPicker.options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => tokenPicker.onChange(opt.id)}
              className={`cursor-pointer rounded-full border px-3.5 py-1 font-mono text-[11px] font-bold transition-all duration-150 ${
                tokenPicker.selected === opt.id
                  ? `border-current bg-surface2 ${opt.color}`
                  : 'border-rim bg-transparent text-muted hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex border-b border-rim">
        {(['transfer', 'approve', 'query'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`-mb-px cursor-pointer border-b-2 border-none bg-transparent px-5 py-2.5 text-[13px] font-bold capitalize transition-all duration-200 ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {tab === 'transfer' ? tabLabels.transfer : tab === 'approve' ? tabLabels.approve : tabLabels.query}
          </button>
        ))}
      </div>

      {activeTab === 'transfer' && (
        <div>
          <p className="mb-4 font-mono text-xs leading-relaxed text-muted">{transfer.desc}</p>
          <div className="mb-2 flex gap-2">
            <Inp
              placeholder={transfer.toPlaceholder}
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
            />
          </div>
          <div className="mb-3 flex gap-2">
            <Inp
              type="number"
              placeholder={transfer.amtPlaceholder}
              value={transferAmt}
              onChange={(e) => setTransferAmt(e.target.value)}
            />
            <Btn variant="primary" onClick={handleTransfer} disabled={busy}>
              {transfer.sendBtn}
            </Btn>
          </div>
          {transfer.feePreview?.(transferAmt)}
        </div>
      )}

      {activeTab === 'approve' && (
        <div>
          <p className="mb-3.5 font-mono text-xs leading-relaxed text-muted">{approve.desc}</p>
          <div className="mb-2 flex gap-2">
            <Inp
              placeholder={approve.spenderPlaceholder}
              value={approveSpender}
              onChange={(e) => setApproveSpender(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Inp
              type="number"
              placeholder={approve.amtPlaceholder}
              value={approveAmt}
              onChange={(e) => setApproveAmt(e.target.value)}
            />
            <Btn variant="outline" onClick={handleApprove} disabled={busy}>
              {approve.approveBtn}
            </Btn>
          </div>
        </div>
      )}

      {activeTab === 'query' && (
        <div>
          <p className="mb-3.5 font-mono text-xs leading-relaxed text-muted">{query.desc}</p>
          <div className="mb-3 flex gap-2">
            <Inp
              placeholder={query.placeholder}
              value={queryAddr}
              onChange={(e) => setQueryAddr(e.target.value)}
            />
            <Btn variant="outline" size="sm" onClick={handleQuery} disabled={queryLoading}>
              {queryLoading ? query.queryingText : query.queryBtn}
            </Btn>
          </div>
          {queryResult && (
            <div className="rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-loose">
              <span className="text-muted">{resultLabels.balanceOf}</span>{' '}
              <span className="text-accent">{queryResult.balance}</span>
              {queryResult.shares && resultLabels.sharesOf && (
                <>
                  <br />
                  <span className="text-muted">{resultLabels.sharesOf}</span>{' '}
                  <span className="text-accent2">{queryResult.shares}</span>
                </>
              )}
              <br />
              <span className="text-muted">{resultLabels.blacklistedLabel}</span>{' '}
              {queryResult.blacklisted ? (
                <span className="rounded-full border border-accent3/30 bg-accent3/15 px-2.5 py-0.5 text-[10px] text-accent3">
                  {resultLabels.yes}
                </span>
              ) : (
                <span className="rounded-full border border-accent2/25 bg-accent2/12 px-2.5 py-0.5 text-[10px] text-accent2">
                  {resultLabels.no}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
