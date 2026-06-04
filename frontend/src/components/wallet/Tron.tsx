import { useState, useEffect, useCallback } from 'react';
import { useTronBalances } from '../../hooks/useTronBalances';
import { type TronWalletState } from '../../hooks/useTronWallet';
import { useLang } from '../../i18n';
import { fmtRaw } from '../../lib/helpers';
import { fetchTrc20AddressQuery } from '../../lib/a7a5/api';
import { StatCard } from '../ui/Cards';
import { SectionTitle } from '../ui/ui';
import { TokenActionsPanel, type TokenQueryResult } from './TokenActionsPanel';


interface ConnectTronProps {
  isAvailable: boolean;
  onConnect: () => void;
  compact?: boolean;
}

function ConnectTron({ isAvailable, onConnect, compact }: ConnectTronProps) {
  const { t } = useLang();
  const button = isAvailable ? (
    <button
      onClick={onConnect}
      className="mt-2 cursor-pointer rounded-lg border-none bg-red-400 px-6 py-2.5 font-sans text-[13px] font-bold text-black transition-all hover:-translate-y-px hover:bg-red-300"
    >
      {t.tronWallet.connectBtn}
    </button>
  ) : (
    <button
      disabled
      className="mt-2 cursor-not-allowed rounded-lg border border-rim bg-surface2 px-6 py-2.5 font-sans text-[13px] font-bold text-muted opacity-60"
    >
      {t.tronWallet.installBtn}
    </button>
  );

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="text-3xl">◈</div>
        <div className="font-mono text-sm text-muted">{t.actions.tronConnectPrompt}</div>
        {button}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-rim bg-surface p-12 text-center">
      <div className="text-4xl">◈</div>
      <div className="text-lg font-bold">{t.tronWallet.connectHeading}</div>
      <div className="font-mono text-sm text-muted">{t.tronWallet.connectDesc}</div>
      {button}
    </div>
  );
}

interface TronWalletProps {
  tronWallet: TronWalletState;
  onConnect: () => void;
}

export function TronWallet({ tronWallet, onConnect }: TronWalletProps) {
  const { t } = useLang();

  // ── Tron wallet ────────────────────────────────────────────────────────────
  const tronBalances = useTronBalances(tronWallet.address);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);
  const showToast = useCallback((msg: string) => setToast(msg), []);

  // ── Token actions handlers (passed to TokenActionsPanel) ──────────────────
  async function handleTransfer(to: string, amount: string): Promise<boolean> {
    if (!to || !amount) { showToast(t.toast.fillFields); return false; }
    showToast(t.toast.tronTransferDone);
    return true;
  }

  async function handleApprove(spender: string, _amount: string): Promise<boolean> {
    if (!spender) { showToast(t.toast.enterSpender); return false; }
    showToast(t.toast.tronApprovalDone);
    return true;
  }

  async function handleQuery(addr: string): Promise<TokenQueryResult | null> {
    if (!addr) { showToast(t.toast.enterTronAddr); return null; }
    try {
      const r = await fetchTrc20AddressQuery(addr);
      return {
        balance: `${fmtRaw(r.balance)} A7A5`,
        blacklisted: r.blacklisted,
      };
    } catch {
      showToast(t.toast.tronQueryFailed);
      return null;
    }
  }

  return (
    <div>
      <SectionTitle>◈ {t.wallet.tronSection}</SectionTitle>
      {!tronWallet.isConnected ? (
        <ConnectTron isAvailable={tronWallet.isAvailable} onConnect={onConnect} />
      ) : (
        <div>
          <SectionTitle>{t.tronWallet.trc20Balances}</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="A7A5 (TRC-20)"
              value={tronBalances.isLoading ? '…' : fmtRaw(tronBalances.data?.a7a5Trc20)}
              sub={t.tronWallet.a7a5TrcSub}
              color="text-accent"
            />
            <StatCard
              label="TRX"
              value={
                tronBalances.isLoading
                  ? '…'
                  : (Number(BigInt(tronBalances.data?.trx ?? '0')) / 1_000_000).toFixed(4)
              }
              sub={t.tronWallet.trxSub}
            />
          </div>
        </div>
      )}
      {tronWallet.isConnected && (
        <div className="grid grid-cols-1 gap-6">
          <div>
            <SectionTitle>{t.actions.tronTokenActions}</SectionTitle>
            <TokenActionsPanel
              tabLabels={{
                transfer: t.actions.transferTab,
                approve: t.actions.approveTab,
                query: t.actions.queryTab,
              }}
              transfer={{
                desc: t.actions.tronTransferDesc,
                toPlaceholder: t.actions.tronTransferToPlaceholder,
                amtPlaceholder: t.actions.tronTransferAmtPlaceholder,
                sendBtn: t.actions.tronSendBtn,
              }}
              approve={{
                desc: t.actions.tronApproveDesc,
                spenderPlaceholder: t.actions.tronSpenderPlaceholder,
                amtPlaceholder: t.actions.tronApproveAmtPlaceholder,
                approveBtn: t.actions.tronApproveBtn,
              }}
              query={{
                desc: t.actions.tronQueryDesc,
                placeholder: t.actions.tronQueryPlaceholder,
                queryBtn: t.actions.tronQueryBtn,
                queryingText: t.actions.querying,
              }}
              resultLabels={{
                balanceOf: t.actions.tronBalanceOf,
                blacklistedLabel: t.actions.blacklistedLabel,
                yes: t.actions.yes,
                no: t.actions.no,
              }}
              onTransfer={handleTransfer}
              onApprove={handleApprove}
              onQuery={handleQuery}
            />
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-999 -translate-x-1/2 rounded-xl border border-rim bg-surface2 px-6 py-3 font-mono text-[13px] text-ink shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
