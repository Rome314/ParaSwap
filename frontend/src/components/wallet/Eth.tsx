import { useState, useEffect, useCallback } from 'react';
import { mainnet } from 'wagmi/chains';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { BrowserProvider, Contract, isAddress, parseUnits } from 'ethers';
import { fmtRaw, fmt } from '../../lib/helpers';
import { StatCard } from '../ui/Cards';
import { SectionTitle, Inp, Btn } from '../ui/ui';
import { useLang } from '../../i18n';
import { useBalances } from '../../hooks/useBalances';
import { useConnectedChain } from '../../hooks/useChain';
import { useProtocolState } from '../../hooks/useProtocolState';
import { getAddresses } from '../../config/addresses';
import { ERC20_ABI, WA7A5_ABI } from '../../lib/a7a5/abis';
import { getProvider } from '../../lib/a7a5/helpers';
import { fetchAddressQuery } from '../../lib/a7a5/api';
import { TokenActionsPanel, type TokenQueryResult } from './TokenActionsPanel';

const DECIMALS = 1_000_000;

export function EthWallet() {
  const { t } = useLang();

  // ── Wagmi ─────────────────────────────────────────────────────────────────
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  // ── Chain + balances ──────────────────────────────────────────────────────
  const chain = useConnectedChain();
  const effectiveChainId = chain.supported ? chain.chainId : mainnet.id;
  const effectiveAddresses = chain.supported ? chain.addresses : getAddresses(mainnet.id);

  const balances = useBalances(
    address,
    chain.supported ? chain.chainId : undefined,
    chain.supported ? chain.addresses : null
  );

  // Wrap/Unwrap
  const [wrapAmount, setWrapAmount] = useState('');

  // ── Protocol state (for wrappedRate) ──────────────────────────────────────
  const protocol = useProtocolState(effectiveChainId, effectiveAddresses, {
    refetchInterval: 10_000,
  });
  const rawA7a5PerWa7a5 = BigInt(protocol.data?.a7a5PerWa7a5 ?? '0');
  const rawWa7a5PerA7a5 = BigInt(protocol.data?.wa7a5PerA7a5 ?? '0');
  const wrappedRate   = rawA7a5PerWa7a5 > 0n ? Number(rawA7a5PerWa7a5) / DECIMALS : 1;
  const unwrappedRate = rawWa7a5PerA7a5 > 0n ? Number(rawWa7a5PerA7a5) / DECIMALS : 1;

  // ── Derived balance values ────────────────────────────────────────────────
  const a7a5Raw = balances.data?.tokens[0].balance ?? '0';
  const wa7a5Raw = balances.data?.tokens[1].balance ?? '0';
  const ethRaw = balances.data?.eth ?? '0';
  const basisPointsRate = Number(BigInt(balances.data?.a7a5State.basisPointsRate ?? '0'));

  const wa7a5Display = Number(BigInt(wa7a5Raw)) / DECIMALS;
  const hasWA7A5Contract = !!effectiveAddresses.A7A5.WA7A5;
  const fullUnwrapPreview = wa7a5Display > 0 ? (wa7a5Display * wrappedRate).toFixed(2) : null;

  // ── Token actions token selector ──────────────────────────────────────────
  const [actionsToken, setActionsToken] = useState<'a7a5' | 'wa7a5'>('a7a5');

  // ── Unwrap form state ─────────────────────────────────────────────────────
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const unwrapOutput = (() => {
    const amt = parseFloat(unwrapAmount);
    if (!amt) return null;
    return (amt * wrappedRate).toFixed(2);
  })();

  const wrapOutput = (() => {
    const amt = parseFloat(wrapAmount);
    if (!amt || wrappedRate === 0) return null;
    return (amt / wrappedRate).toFixed(2);
  })();

  // ── Yield estimate ────────────────────────────────────────────────────────
  const yieldResult = (Number(BigInt(a7a5Raw)) / DECIMALS) * 0.145;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);
  const showToast = useCallback((msg: string) => setToast(msg), []);

  function handleConnectWallet() {
    if (isConnected) {
      disconnect();
    } else {
      const inj = connectors.find((c) => c.name === 'Injected') ?? connectors[0];
      if (inj) connect({ connector: inj });
    }
  }

  async function handleWrap() {
    const amt = parseFloat(wrapAmount);
    if (!amt) return showToast(t.toast.enterAmount);
    const wa7a5Addr = effectiveAddresses.A7A5.WA7A5;
    if (!wa7a5Addr || !address || !connector) return;
    setBusy(true);
    try {
      const ethProvider = await connector.getProvider();
      const provider = new BrowserProvider(ethProvider as ConstructorParameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner();
      const amountIn = parseUnits(wrapAmount, 6);
      const a7a5Contract = new Contract(effectiveAddresses.A7A5.A7A5, ERC20_ABI, signer);
      showToast(t.toast.checkingAllowance);
      const allowance: bigint = await a7a5Contract.allowance(address, wa7a5Addr);
      if (allowance < amountIn) {
        showToast(t.toast.approvingA7a5);
        await (await a7a5Contract.approve(wa7a5Addr, amountIn)).wait();
      }
      showToast(t.toast.wrapping);
      const wa7a5Contract = new Contract(wa7a5Addr, WA7A5_ABI, signer);
      await (await wa7a5Contract.wrap(amountIn)).wait();
      setWrapAmount('');
      await Promise.all([balances.refetch(), protocol.refetch()]);
      showToast(t.toast.wrapped);
    } catch (e) {
      showToast((e as Error).message?.slice(0, 80) ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnwrap() {
    const amt = parseFloat(unwrapAmount);
    if (!amt) return showToast(t.toast.enterAmount);
    const wa7a5Addr = effectiveAddresses.A7A5.WA7A5;
    if (!wa7a5Addr || !address || !connector) return;
    setBusy(true);
    try {
      const ethProvider = await connector.getProvider();
      const provider = new BrowserProvider(ethProvider as ConstructorParameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner();
      const amountIn = parseUnits(unwrapAmount, 6);
      showToast(t.toast.unwrapping);
      const wa7a5Contract = new Contract(wa7a5Addr, WA7A5_ABI, signer);
      await (await wa7a5Contract.unwrap(amountIn)).wait();
      setUnwrapAmount('');
      await Promise.all([balances.refetch(), protocol.refetch()]);
      showToast(t.toast.unwrapped);
    } catch (e) {
      showToast((e as Error).message?.slice(0, 80) ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  // ── Token actions handlers (passed to TokenActionsPanel) ──────────────────
  async function handleTransfer(to: string, amount: string): Promise<boolean> {
    if (!to || !amount) { showToast(t.toast.fillFields); return false; }
    if (!connector || !address) { showToast(t.toast.noWallet); return false; }
    const tokenAddr = actionsToken === 'a7a5'
      ? effectiveAddresses.A7A5.A7A5
      : effectiveAddresses.A7A5.WA7A5;
    if (!tokenAddr) return false;
    setBusy(true);
    try {
      showToast(t.toast.transferring);
      const provider = new BrowserProvider(
        (await connector.getProvider()) as ConstructorParameters<typeof BrowserProvider>[0]
      );
      const signer = await provider.getSigner();
      const tx = await new Contract(tokenAddr, ERC20_ABI, signer).transfer(
        to,
        parseUnits(amount, 6)
      );
      await tx.wait();
      await balances.refetch();
      showToast(t.toast.transferDone);
      return true;
    } catch (e) {
      showToast((e as Error).message?.slice(0, 80) ?? 'Error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(spender: string, amount: string): Promise<boolean> {
    if (!spender) { showToast(t.toast.enterSpender); return false; }
    if (!connector || !address) { showToast(t.toast.noWallet); return false; }
    const tokenAddr = actionsToken === 'a7a5'
      ? effectiveAddresses.A7A5.A7A5
      : effectiveAddresses.A7A5.WA7A5;
    if (!tokenAddr) return false;
    setBusy(true);
    try {
      showToast(t.toast.approving);
      const provider = new BrowserProvider(
        (await connector.getProvider()) as ConstructorParameters<typeof BrowserProvider>[0]
      );
      const signer = await provider.getSigner();
      const amountIn = amount ? parseUnits(amount, 6) : (2n ** 256n - 1n);
      const tx = await new Contract(tokenAddr, ERC20_ABI, signer).approve(spender, amountIn);
      await tx.wait();
      showToast(t.toast.approvalDone);
      return true;
    } catch (e) {
      showToast((e as Error).message?.slice(0, 80) ?? 'Error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleQuery(addr: string): Promise<TokenQueryResult | null> {
    if (!addr) { showToast(t.toast.enterAddress); return null; }
    if (!isAddress(addr)) { showToast(t.toast.invalidAddress); return null; }
    try {
      if (actionsToken === 'wa7a5' && effectiveAddresses.A7A5.WA7A5) {
        const p = getProvider(effectiveChainId);
        const bal: bigint = await new Contract(
          effectiveAddresses.A7A5.WA7A5,
          ERC20_ABI,
          p
        ).balanceOf(addr);
        return { balance: `${fmtRaw(bal.toString())} wA7A5`, blacklisted: false };
      }
      const r = await fetchAddressQuery(addr, effectiveChainId, effectiveAddresses);
      return {
        balance: `${fmtRaw(r.balance)} A7A5`,
        shares: `${fmtRaw(r.shares)} ${t.actions.sharesUnit}`,
        blacklisted: r.blacklisted,
      };
    } catch {
      showToast(t.toast.queryFailed);
      return null;
    }
  }

  function feePreview(amount: string): React.ReactNode {
    if (actionsToken !== 'a7a5') return null;
    const cls = 'rounded-xl border border-accent2/20 bg-accent2/6 px-4 py-3.5 font-mono text-[11px] leading-[1.7] text-muted';
    if (basisPointsRate === 0) {
      return (
        <div className={cls}>
          <strong className="text-accent2">{t.actions.feeBreakdown}</strong>
          {' '}<span className="text-muted">No transfer fee</span>
        </div>
      );
    }
    const amt = parseFloat(amount);
    const fee = amt > 0 ? (amt * basisPointsRate) / 10000 : 0;
    const receives = amt > 0 ? amt - fee : 0;
    return (
      <div className={cls}>
        <strong className="text-accent2">{t.actions.feeBreakdown}</strong>
        {' '}{(basisPointsRate / 100).toFixed(2)}% ({basisPointsRate} bps)
        {amt > 0 && (
          <>
            <br />
            <span className="text-muted">{t.actions.feeAmount}</span>{' '}
            <span className="text-accent3">{fee.toFixed(2)} A7A5</span>
            <br />
            <span className="text-muted">{t.actions.recipientReceives}</span>{' '}
            <strong className="text-accent">{receives.toFixed(2)} A7A5</strong>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>⟠ {t.wallet.ethSection}</SectionTitle>
      {
        <div className="grid gap-4">
          <div>
            <SectionTitle>{t.wallet.erc20Balances}</SectionTitle>
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                label="A7A5"
                value={balances.isLoading ? '…' : fmtRaw(a7a5Raw)}
                sub={t.wallet.a7a5Sub}
                color="text-accent"
                tip={t.wallet.a7a5Tip}
              />
              <StatCard
                label="wA7A5"
                value={balances.isLoading ? '…' : fmtRaw(wa7a5Raw)}
                sub={t.wallet.wa7a5Sub}
                color="text-accent2"
                tip={t.wallet.wa7a5Tip}
              />
              <StatCard
                label="ETH"
                value={balances.isLoading ? '…' : (Number(BigInt(ethRaw)) / 1e18).toFixed(2)}
                sub={t.wallet.ethSub}
                tip={t.wallet.ethTip}
              />
            </div>
          </div>

          {/* wA7A5 unwrap preview */}
          {fullUnwrapPreview && (
            <div>
              <SectionTitle>{t.wallet.unwrapPreview}</SectionTitle>
              <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
                <div className="mb-4 flex items-center gap-6">
                  <div className="flex-1 rounded-xl border border-rim bg-surface2 p-4 text-center">
                    <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                      {t.wallet.youHold}
                    </div>
                    <div className="font-mono text-xl font-bold text-accent2">
                      {fmtRaw(wa7a5Raw)} wA7A5
                    </div>
                  </div>
                  <div className="text-xl text-muted">→</div>
                  <div className="flex-1 rounded-xl border border-accent/20 bg-surface2 p-4 text-center">
                    <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                      {t.wallet.youReceive}
                    </div>
                    <div className="font-mono text-xl font-bold text-accent">
                      {fullUnwrapPreview} A7A5
                    </div>
                  </div>
                </div>
                <div className="mb-4 font-mono text-[11px] text-muted">
                  {t.wallet.rateLabel(wrappedRate.toFixed(2))}
                </div>
                <div className="flex gap-2">
                  <Inp
                    type="number"
                    placeholder={t.wallet.unwrapPlaceholder}
                    value={unwrapAmount}
                    onChange={(e) => setUnwrapAmount(e.target.value)}
                  />
                  <Btn variant="success" onClick={handleUnwrap} disabled={busy}>
                    {t.wallet.unwrapBtn}
                  </Btn>
                  <Btn variant="outline" onClick={() => setUnwrapAmount(wa7a5Display.toString())}>
                    {t.wallet.maxBtn}
                  </Btn>
                </div>
                {unwrapOutput && (
                  <div className="mt-2 rounded-lg border border-accent/20 bg-accent/8 px-3.5 py-2.5 font-mono text-xs text-accent">
                    {t.wallet.receivePrefix} <strong>{unwrapOutput} A7A5</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Yield estimate */}
          <div>
            <SectionTitle>{t.wallet.yieldTitle}</SectionTitle>
            <div className="rounded-2xl border border-rim bg-surface p-6">
              <div className="flex items-end gap-4">
                <div>
                  <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                    {t.wallet.currentBalance}
                  </div>
                  <div className="font-mono text-2xl text-accent">{fmtRaw(a7a5Raw)} A7A5</div>
                </div>
                <div className="mb-1 text-muted">×</div>
                <div>
                  <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                    {t.wallet.yieldApr}
                  </div>
                  <div className="font-mono text-2xl text-accent2">14.5%</div>
                </div>
                <div className="mb-1 text-muted">=</div>
                <div>
                  <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                    {t.wallet.estYield}
                  </div>
                  <div className="font-mono text-2xl text-ink">{fmt(yieldResult)} A7A5</div>
                </div>
              </div>
              <div className="mt-3 font-mono text-[11px] text-muted">{t.wallet.yieldNote}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Wrap — always visible; unwrap is handled by the preview card above */}
            <div>
              <SectionTitle>{t.actions.wrapTitle}</SectionTitle>
              <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
                <p className="mb-3.5 font-mono text-xs leading-relaxed text-muted">
                  {t.actions.wrapDesc}
                </p>
                <div className="mb-2 flex gap-2">
                  <Inp
                    type="number"
                    placeholder={t.actions.wrapPlaceholder}
                    value={wrapAmount}
                    onChange={(e) => setWrapAmount(e.target.value)}
                  />
                  <Btn variant="primary" onClick={handleWrap} disabled={busy}>
                    {t.actions.wrapBtn}
                  </Btn>
                </div>
                {wrapOutput && (
                  <div className="mt-2 rounded-lg border border-accent/20 bg-accent/8 px-3.5 py-2.5 font-mono text-xs text-accent">
                    {t.actions.receivePrefix} <strong>{wrapOutput} wA7A5</strong>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {[
                    { label: t.actions.rate1Label, value: wrappedRate.toFixed(2), sub: 'A7A5', color: 'text-accent' },
                    { label: t.actions.rate2Label, value: unwrappedRate.toFixed(2), sub: 'wA7A5', color: 'text-accent2' },
                  ].map((r) => (
                    <div key={r.label} className="rounded-xl border border-rim bg-surface2 p-3.5">
                      <div className="mb-1.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">{r.label}</div>
                      <div className={`font-mono text-lg ${r.color}`}>{r.value}</div>
                      <div className="font-mono text-[10px] text-muted">{r.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ETH Token Actions */}
            <div>
              <SectionTitle>{t.actions.tokenActions}</SectionTitle>
              <TokenActionsPanel
                tabLabels={{
                  transfer: t.actions.transferTab,
                  approve: t.actions.approveTab,
                  query: t.actions.queryTab,
                }}
                tokenPicker={hasWA7A5Contract ? {
                  options: [
                    { id: 'a7a5', label: 'A7A5', color: 'text-accent' },
                    { id: 'wa7a5', label: 'wA7A5', color: 'text-accent2' },
                  ],
                  selected: actionsToken,
                  onChange: (id) => setActionsToken(id as 'a7a5' | 'wa7a5'),
                } : undefined}
                transfer={{
                  desc: actionsToken === 'a7a5' ? t.actions.transferDesc : t.actions.wa7a5TransferDesc,
                  toPlaceholder: t.actions.transferToPlaceholder,
                  amtPlaceholder: t.actions.transferAmtPlaceholder,
                  sendBtn: t.actions.sendBtn,
                  feePreview,
                }}
                approve={{
                  desc: actionsToken === 'a7a5' ? t.actions.approveDesc : t.actions.wa7a5ApproveDesc,
                  spenderPlaceholder: t.actions.spenderPlaceholder,
                  amtPlaceholder: t.actions.approveAmtPlaceholder,
                  approveBtn: t.actions.approveBtn,
                }}
                query={{
                  desc: t.actions.queryDesc,
                  placeholder: t.actions.queryPlaceholder,
                  queryBtn: t.actions.queryBtn,
                  queryingText: t.actions.querying,
                }}
                resultLabels={{
                  balanceOf: t.actions.balanceOf,
                  sharesOf: actionsToken === 'a7a5' ? t.actions.sharesOf : undefined,
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
        </div>
      }
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-999 -translate-x-1/2 rounded-xl border border-rim bg-surface2 px-6 py-3 font-mono text-[13px] text-ink shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
