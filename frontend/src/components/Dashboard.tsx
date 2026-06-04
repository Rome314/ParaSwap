import { useState, useEffect, useCallback, useMemo } from 'react';
import { isAddress } from 'ethers';
import { mainnet, sepolia } from 'wagmi/chains';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useConnectedChain } from '../hooks/useChain';
import { useProtocolState } from '../hooks/useProtocolState';
import { useBalances } from '../hooks/useBalances';
import { useRoles } from '../hooks/useRoles';
import { useEvents } from '../hooks/useEvents';
import {
  fetchAddressQuery,
  fetchTrc20TotalSupply,
  fetchTrc20Paused,
  fetchEthAllowance,
  fetchTrc20AddressQuery,
  fetchTrc20Allowance,
} from '../lib/a7a5/api';

import { getAddresses } from '../config/addresses';
import { ProtocolOverview } from './overview/Overview';
import { StatCard, RoleCard } from './ui/Cards';
import { fmtRaw, fmt } from '../lib/helpers';
import { Inp, Btn, SectionTitle } from './ui/ui';
import { LangToggle } from './ui/Lang';
import { CopyableAddr } from './ui/Addr';
import { useLang } from '../i18n';
import { Wallet } from './wallet/Wallet';
import { Swap } from './swap/Swap';
import { type TokenQueryResult } from './wallet/TokenActionsPanel';

// ── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = 'wallet' | 'overview' | 'admin' | 'actions' | 'swap';

// ── Constants ─────────────────────────────────────────────────────────────────

const DECIMALS = 1_000_000;

// ── Main Component ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const { t } = useLang();

  // ── Chain / protocol state ─────────────────────────────────────────────────
  const chain = useConnectedChain();
  const effectiveChainId = chain.supported ? chain.chainId : mainnet.id;
  const effectiveAddresses = chain.supported ? chain.addresses : getAddresses(mainnet.id);

  const protocol = useProtocolState(
    chain.supported ? chain.chainId : undefined,
    chain.supported ? chain.addresses : null
  );

  // ── Wagmi ─────────────────────────────────────────────────────────────────
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  // ── Data hooks ────────────────────────────────────────────────────────────
  // const balances = useBalances(
  //   address,
  //   chain.supported ? chain.chainId : undefined,
  //   chain.supported ? chain.addresses : null
  // );
  const roles = useRoles(
    chain.supported ? chain.chainId : undefined,
    chain.supported ? chain.addresses : null
  );
  const events = useEvents(
    chain.supported ? chain.chainId : undefined,
    chain.supported ? chain.addresses : null
  );

  // ── Derived protocol values ────────────────────────────────────────────────
  const rawTotalLiq = BigInt(protocol.data?.totalLiquidity ?? '0');
  const rawTotalShares = BigInt(protocol.data?.totalShares ?? '0');
  const totalLiquidity = Number(rawTotalLiq) / DECIMALS;
  const totalShares = Number(rawTotalShares) / DECIMALS;
  const basisPoints = Number(protocol.data?.basisPointsRate ?? '0');
  const paused = protocol.data?.paused ?? false;
  const wrappedRate = rawTotalShares > 0n ? Number(rawTotalLiq) / Number(rawTotalShares) : 1;

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('wallet');
  const [toast, setToast] = useState<string | null>(null);

  // Actions tab chain switcher (was global)
  const [actionsChain, setActionsChain] = useState<'eth' | 'tron'>(
    () => (localStorage.getItem('activeChain') as 'eth' | 'tron') ?? 'eth'
  );
  function handleSetActionsChain(c: 'eth' | 'tron') {
    setActionsChain(c);
    localStorage.setItem('activeChain', c);
  }

  // Admin — blacklist checker
  const [blAddr, setBlAddr] = useState('');
  const [blStatus, setBlStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [blacklistRows] = useState([{ addr: '0x1a2b…3c4d' }, { addr: '0x9f8e…7d6c' }]);

  // Admin — ETH balance/allowance inspector
  const [adminQueryAddr, setAdminQueryAddr] = useState('');
  const [adminQueryResult, setAdminQueryResult] = useState<TokenQueryResult | null>(null);
  const [adminQueryLoading, setAdminQueryLoading] = useState(false);
  const [adminAllowanceOwner, setAdminAllowanceOwner] = useState('');
  const [adminAllowanceSpender, setAdminAllowanceSpender] = useState('');
  const [adminAllowanceResult, setAdminAllowanceResult] = useState<string | null>(null);
  const [adminAllowanceLoading, setAdminAllowanceLoading] = useState(false);

  // Admin — TRON balance/allowance inspector
  const [tronAdminQueryAddr, setTronAdminQueryAddr] = useState('');
  const [tronAdminQueryResult, setTronAdminQueryResult] = useState<TokenQueryResult | null>(null);
  const [tronAdminQueryLoading, setTronAdminQueryLoading] = useState(false);
  const [tronAdminAllowanceOwner, setTronAdminAllowanceOwner] = useState('');
  const [tronAdminAllowanceSpender, setTronAdminAllowanceSpender] = useState('');
  const [tronAdminAllowanceResult, setTronAdminAllowanceResult] = useState<string | null>(null);
  const [tronAdminAllowanceLoading, setTronAdminAllowanceLoading] = useState(false);

  // TRC-20 total supply & paused (overview tab)
  const [trc20Supply, setTrc20Supply] = useState<string | null>(null);
  const [trc20Paused, setTrc20Paused] = useState<boolean | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Fetch TRON data once when overview tab opens
  useEffect(() => {
    if (activeTab !== 'overview') return;
    if (trc20Supply === null) {
      fetchTrc20TotalSupply()
        .then((v) => setTrc20Supply(v))
        .catch(() => setTrc20Supply('unavailable'));
    }
    if (trc20Paused === null) {
      fetchTrc20Paused()
        .then((v) => setTrc20Paused(v))
        .catch(() => setTrc20Paused(false));
    }
  }, [activeTab, trc20Supply, trc20Paused]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  // ── Derived wallet values ──────────────────────────────────────────────────
  // const a7a5Raw = balances.data?.tokens[0].balance ?? '0';
  // const wa7a5Raw = balances.data?.tokens[1].balance ?? '0';
  // const ethRaw = balances.data?.eth ?? '0';

  // const wa7a5Display = Number(BigInt(wa7a5Raw)) / DECIMALS;
  // const fullUnwrapPreview = wa7a5Display > 0 ? (wa7a5Display * wrappedRate).toFixed(4) : null;

  // const yieldResult = (() => {
  //   const a = Number(BigInt(a7a5Raw)) / DECIMALS;
  //   return a * 0.145 * 1;
  // })();

  // ── Explorer URL helpers ──────────────────────────────────────────────────
  function ethExplorer(addr: string) {
    const base = 'https://sepolia.etherscan.io';
    return `${base}/address/${addr}`;
  }
  function tronExplorer(addr: string) {
    return `https://tronscan.org/#/address/${addr}`;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  // function handleConnectWallet() {
  //   if (isConnected) {
  //     disconnect();
  //   } else {
  //     const inj = connectors.find((c) => c.name === 'Injected') ?? connectors[0];
  //     if (inj) connect({ connector: inj });
  //     else showToast(t.toast.noWallet);
  //   }
  // }

  // Admin read handlers
  function handleCheckBlacklist() {
    if (!blAddr) return showToast(t.toast.enterAddress);
    const bl = blacklistRows.some((r) => r.addr.startsWith(blAddr.slice(0, 6)));
    setBlStatus({ msg: bl ? t.toast.isBlacklisted : t.toast.notBlacklisted, ok: !bl });
  }

  async function handleAdminQuery() {
    if (!adminQueryAddr) return showToast(t.toast.enterAddress);
    if (!isAddress(adminQueryAddr)) return showToast(t.toast.invalidAddress);
    setAdminQueryLoading(true);
    setAdminQueryResult(null);
    try {
      const result = await fetchAddressQuery(adminQueryAddr, effectiveChainId, effectiveAddresses);
      setAdminQueryResult({
        balance: `${fmtRaw(result.balance)} A7A5`,
        shares: `${fmtRaw(result.shares)} ${t.actions.sharesUnit}`,
        blacklisted: result.blacklisted,
      });
    } catch {
      showToast(t.toast.queryFailed);
    } finally {
      setAdminQueryLoading(false);
    }
  }

  async function handleAdminAllowance() {
    if (!adminAllowanceOwner || !adminAllowanceSpender) return showToast(t.toast.fillFields);
    if (!isAddress(adminAllowanceOwner) || !isAddress(adminAllowanceSpender))
      return showToast(t.toast.invalidAddress);
    setAdminAllowanceLoading(true);
    setAdminAllowanceResult(null);
    try {
      const raw = await fetchEthAllowance(
        adminAllowanceOwner,
        adminAllowanceSpender,
        effectiveChainId,
        effectiveAddresses
      );
      setAdminAllowanceResult(`${fmtRaw(raw)} A7A5`);
    } catch {
      showToast(t.toast.allowanceFailed);
    } finally {
      setAdminAllowanceLoading(false);
    }
  }

  async function handleTronAdminQuery() {
    if (!tronAdminQueryAddr) return showToast(t.toast.enterTronAddr);
    setTronAdminQueryLoading(true);
    setTronAdminQueryResult(null);
    try {
      const result = await fetchTrc20AddressQuery(tronAdminQueryAddr);
      setTronAdminQueryResult({
        balance: `${fmtRaw(result.balance)} A7A5`,
        blacklisted: result.blacklisted,
      });
    } catch {
      showToast(t.toast.trc20Failed);
    } finally {
      setTronAdminQueryLoading(false);
    }
  }

  async function handleTronAdminAllowance() {
    if (!tronAdminAllowanceOwner || !tronAdminAllowanceSpender)
      return showToast(t.toast.fillFields);
    setTronAdminAllowanceLoading(true);
    setTronAdminAllowanceResult(null);
    try {
      const raw = await fetchTrc20Allowance(tronAdminAllowanceOwner, tronAdminAllowanceSpender);
      setTronAdminAllowanceResult(`${fmtRaw(raw)} A7A5`);
    } catch {
      showToast(t.toast.allowanceFailed);
    } finally {
      setTronAdminAllowanceLoading(false);
    }
  }

  // ── Tab config ────────────────────────────────────────────────────────────

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'wallet', label: t.tabs.wallet },
    { id: 'overview', label: t.tabs.overview },
    { id: 'swap', label: t.tabs.swap },
    { id: 'admin', label: t.tabs.admin },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative z-[1]">
      {/* HEADER */}
      <header className="sticky top-0 z-[100] flex h-16 items-center justify-between gap-6 border-b border-rim bg-bg/85 px-10 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-3 font-mono text-lg font-bold tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-bold text-black">
            A7
          </div>
          <span>A7A5</span>
        </div>

        {/* Tab nav */}
        <nav className="flex items-center gap-0.5 rounded-lg border border-rim bg-surface2 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer rounded-md border-none px-4 py-1.5 font-sans text-[12px] font-bold whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? tab.id === 'admin'
                    ? 'bg-accent3 text-white'
                    : tab.id === 'swap'
                      ? 'bg-accent2 text-black'
                      : 'bg-accent text-black'
                  : 'bg-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <LangToggle />
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-6 px-10 py-10">
        {/* ═══════════════════════════════════════════════════════════════════
            WALLET TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'wallet' && <Wallet></Wallet>}

        {/* ═══════════════════════════════════════════════════════════════════
            PROTOCOL OVERVIEW TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && <ProtocolOverview></ProtocolOverview>}

        {/* ═══════════════════════════════════════════════════════════════════
            SWAP TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'swap' && (
          <Swap chainId={effectiveChainId} addresses={effectiveAddresses} />
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ADMIN TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'admin' && (
          <>
            {/* Roles & protocol state */}
            <div>
              <SectionTitle>{t.admin.rolesTitle}</SectionTitle>
              <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
                {roles.isLoading ? (
                  <div className="py-2 font-mono text-xs text-muted">{t.overview.loadingRoles}</div>
                ) : roles.data ? (
                  <>
                    <RoleCard
                      icon="👑"
                      iconBg="bg-accent/15"
                      name={t.overview.ownerName}
                      desc={t.overview.ownerDesc}
                      quorum={t.overview.ownerQuorum}
                      address={roles.data.owner}
                      href={ethExplorer(roles.data.owner)}
                    />
                    <RoleCard
                      icon="📊"
                      iconBg="bg-accent2/15"
                      name={t.overview.accountantName}
                      desc={t.overview.accountantDesc}
                      quorum={t.overview.accountantQuorum}
                      address={roles.data.accountant}
                      href={ethExplorer(roles.data.accountant)}
                    />
                    <RoleCard
                      icon="🛡️"
                      iconBg="bg-accent3/15"
                      name={t.overview.complianceName}
                      desc={t.overview.complianceDesc}
                      quorum={t.overview.complianceQuorum}
                      address={roles.data.compliance}
                      href={ethExplorer(roles.data.compliance)}
                    />
                  </>
                ) : (
                  <div className="font-mono text-xs text-muted">{t.overview.connectForRoles}</div>
                )}
                {/* Protocol state summary */}
                {protocol.data && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-rim bg-surface2 p-3.5">
                      <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                        {t.overview.transferFee}
                      </div>
                      <div className="font-mono text-lg text-accent">{basisPoints} bp</div>
                    </div>
                    <div className="rounded-xl border border-rim bg-surface2 p-3.5">
                      <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                        {t.overview.totalLiquidity}
                      </div>
                      <div className="font-mono text-lg text-accent">{fmt(totalLiquidity)}</div>
                    </div>
                    <div className="rounded-xl border border-rim bg-surface2 p-3.5">
                      <div className="mb-1 font-mono text-[10px] tracking-[1px] text-muted uppercase">
                        ETH Status
                      </div>
                      <div
                        className={`font-mono text-lg ${paused ? 'text-accent3' : 'text-accent2'}`}
                      >
                        {paused ? `⏸ ${t.overview.pausedBadge}` : `▶ ${t.overview.liveBadge}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Blacklist checker */}
            <div>
              <SectionTitle>{t.admin.blacklistTitle}</SectionTitle>
              <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent3/30">
                <div className="mb-4 flex gap-2">
                  <Inp
                    placeholder={t.admin.blPlaceholder}
                    value={blAddr}
                    onChange={(e) => setBlAddr(e.target.value)}
                  />
                  <Btn variant="outline" size="sm" onClick={handleCheckBlacklist}>
                    {t.admin.checkBtn}
                  </Btn>
                </div>
                {blStatus && (
                  <div
                    className={`mb-4 rounded-lg border px-3.5 py-2.5 font-mono text-xs ${blStatus.ok ? 'border-accent2/30 bg-accent2/10 text-accent2' : 'border-accent3/30 bg-accent3/10 text-accent3'}`}
                  >
                    {blStatus.msg}
                  </div>
                )}
                <div className="mb-2.5 font-mono text-xs font-semibold text-muted">
                  {t.admin.blacklistedAddresses}
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {[t.admin.colAddress, t.admin.colStatus].map((h) => (
                        <th
                          key={h}
                          className="border-b border-rim px-3 py-2 text-left font-mono text-[10px] tracking-[1.5px] text-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blacklistRows.map((row, i) => (
                      <tr key={i} className="hover:[&>td]:bg-white/[0.02]">
                        <td className="border-b border-rim/50 px-3 py-3 align-middle font-mono text-xs">
                          <span className="rounded bg-surface2 px-2 py-0.5 text-[11px] text-ink">
                            {row.addr}
                          </span>
                        </td>
                        <td className="border-b border-rim/50 px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent3/30 bg-accent3/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent3">
                            {t.admin.frozen}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ETH balance / allowance inspector */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <SectionTitle>{t.admin.balanceInspectorTitle}</SectionTitle>
                <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
                  <div className="mb-3 flex gap-2">
                    <Inp
                      placeholder={t.admin.balanceInspectorPlaceholder}
                      value={adminQueryAddr}
                      onChange={(e) => setAdminQueryAddr(e.target.value)}
                    />
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={handleAdminQuery}
                      disabled={adminQueryLoading}
                    >
                      {adminQueryLoading ? t.admin.querying : t.admin.balanceInspectorBtn}
                    </Btn>
                  </div>
                  {adminQueryResult && (
                    <div className="mb-4 rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-[2]">
                      <span className="text-muted">{t.actions.balanceOf}</span>{' '}
                      <span className="text-accent">{adminQueryResult.balance}</span>
                      <br />
                      <span className="text-muted">{t.actions.sharesOf}</span>{' '}
                      <span className="text-accent2">{adminQueryResult.shares}</span>
                      <br />
                      <span className="text-muted">{t.actions.blacklistedLabel}</span>{' '}
                      {adminQueryResult.blacklisted ? (
                        <span className="rounded-full border border-accent3/30 bg-accent3/15 px-2.5 py-0.5 text-[10px] text-accent3">
                          {t.actions.yes}
                        </span>
                      ) : (
                        <span className="rounded-full border border-accent2/25 bg-accent2/12 px-2.5 py-0.5 text-[10px] text-accent2">
                          {t.actions.no}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 mb-2 text-[12px] font-bold">{t.admin.allowanceTitle}</div>
                  <div className="mb-2 flex gap-2">
                    <Inp
                      placeholder={t.admin.allowanceOwnerPlaceholder}
                      value={adminAllowanceOwner}
                      onChange={(e) => setAdminAllowanceOwner(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Inp
                      placeholder={t.admin.allowanceSpenderPlaceholder}
                      value={adminAllowanceSpender}
                      onChange={(e) => setAdminAllowanceSpender(e.target.value)}
                    />
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={handleAdminAllowance}
                      disabled={adminAllowanceLoading}
                    >
                      {adminAllowanceLoading ? t.admin.querying : t.admin.checkAllowanceBtn}
                    </Btn>
                  </div>
                  {adminAllowanceResult !== null && (
                    <div className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.08] px-3.5 py-2.5 font-mono text-xs text-accent">
                      {t.admin.allowanceResult} <strong>{adminAllowanceResult}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* TRON balance / allowance inspector */}
              <div>
                <SectionTitle>{t.admin.tronInspectorTitle}</SectionTitle>
                <div className="card-glow relative overflow-hidden rounded-2xl border border-rim bg-surface p-6 transition-colors hover:border-accent/30">
                  <div className="mb-3 flex gap-2">
                    <Inp
                      placeholder={t.admin.tronAddrPlaceholder}
                      value={tronAdminQueryAddr}
                      onChange={(e) => setTronAdminQueryAddr(e.target.value)}
                    />
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={handleTronAdminQuery}
                      disabled={tronAdminQueryLoading}
                    >
                      {tronAdminQueryLoading ? t.admin.querying : t.admin.tronQueryBtn}
                    </Btn>
                  </div>
                  {tronAdminQueryResult && (
                    <div className="mb-4 rounded-xl border border-rim bg-surface2 p-3.5 font-mono text-[11px] leading-[2]">
                      <span className="text-muted">{t.actions.tronBalanceOf}</span>{' '}
                      <span className="text-accent">{tronAdminQueryResult.balance}</span>
                      <br />
                      <span className="text-muted">{t.actions.blacklistedLabel}</span>{' '}
                      {tronAdminQueryResult.blacklisted ? (
                        <span className="rounded-full border border-accent3/30 bg-accent3/15 px-2.5 py-0.5 text-[10px] text-accent3">
                          {t.actions.yes}
                        </span>
                      ) : (
                        <span className="rounded-full border border-accent2/25 bg-accent2/12 px-2.5 py-0.5 text-[10px] text-accent2">
                          {t.actions.no}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 mb-2 text-[12px] font-bold">
                    {t.admin.tronAllowanceTitle}
                  </div>
                  <div className="mb-2 flex gap-2">
                    <Inp
                      placeholder={t.admin.tronAllowanceOwnerPlaceholder}
                      value={tronAdminAllowanceOwner}
                      onChange={(e) => setTronAdminAllowanceOwner(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Inp
                      placeholder={t.admin.tronAllowanceSpenderPlaceholder}
                      value={tronAdminAllowanceSpender}
                      onChange={(e) => setTronAdminAllowanceSpender(e.target.value)}
                    />
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={handleTronAdminAllowance}
                      disabled={tronAdminAllowanceLoading}
                    >
                      {tronAdminAllowanceLoading ? t.admin.querying : t.admin.tronCheckAllowanceBtn}
                    </Btn>
                  </div>
                  {tronAdminAllowanceResult !== null && (
                    <div className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.08] px-3.5 py-2.5 font-mono text-xs text-accent">
                      {t.admin.allowanceResult} <strong>{tronAdminAllowanceResult}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[999] -translate-x-1/2 rounded-xl border border-rim bg-surface2 px-6 py-3 font-mono text-[13px] text-ink shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
