import { useState } from 'react';
import { mainnet } from 'wagmi/chains';
import { useAccount, useConnect, useDisconnect, useConnectors } from 'wagmi';
import { useLang } from '../../i18n';
import { useTronWallet, useTronProviders, TronProviderEntry } from '../../hooks/useTronWallet';
import { useConnectedChain } from '../../hooks/useChain';
import { useProtocolState } from '../../hooks/useProtocolState';
import { getAddresses } from '../../config/addresses';
import { EthWallet } from './Eth';
import { TronWallet } from './Tron';
import { WalletPickerModal } from './WalletPickerModal';

export function Wallet() {
  const { t } = useLang();

  const [walletChain, setWalletChain] = useState<'eth' | 'tron'>(
    () => (localStorage.getItem('walletChain') as 'eth' | 'tron') ?? 'eth'
  );

  // Protocol status badges
  const chain = useConnectedChain();
  const effectiveChainId = chain.supported ? chain.chainId : mainnet.id;
  const effectiveAddresses = chain.supported ? chain.addresses : getAddresses(mainnet.id);
  const protocol = useProtocolState(effectiveChainId, effectiveAddresses, { refetchInterval: 10_000 });
  const paused = protocol.data?.paused ?? false;

  // ETH wallet
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const connectors = useConnectors();

  // Tron wallet — selected provider drives the active session
  const tronProviders = useTronProviders();
  const [selectedTronProvider, setSelectedTronProvider] = useState<TronProviderEntry | undefined>();
  const tronWallet = useTronWallet(selectedTronProvider);

  // Picker visibility
  const [showEthPicker, setShowEthPicker] = useState(false);
  const [showTronPicker, setShowTronPicker] = useState(false);

  function handleConnectEth() {
    if (isConnected) {
      disconnect();
      return;
    }
    if (connectors.length === 1) {
      connect({ connector: connectors[0] });
    } else {
      setShowEthPicker(true);
    }
  }

  function handleSelectEthConnector(id: string) {
    setShowEthPicker(false);
    const connector = connectors.find((c) => c.uid === id);
    if (connector) connect({ connector });
  }

  function handleConnectTron() {
    if (tronWallet.isConnected) {
      tronWallet.disconnect();
      return;
    }
    if (tronProviders.length === 1) {
      setSelectedTronProvider(tronProviders[0]);
    } else if (tronProviders.length > 1) {
      setShowTronPicker(true);
    }
  }

  function handleSelectTronProvider(id: string) {
    setShowTronPicker(false);
    const entry = tronProviders.find((p) => p.id === id);
    if (!entry) return;
    setSelectedTronProvider(entry);
    // useTronWallet effect re-runs when selectedTronProvider changes and calls tron_requestAccounts
  }

  function handleSwitchChain(c: 'eth' | 'tron') {
    setWalletChain(c);
    localStorage.setItem('walletChain', c);
  }

  const ethConnectorOptions = connectors.map((c) => ({
    id: c.uid,
    name: c.name,
    icon: c.icon,
  }));

  const tronProviderOptions = tronProviders.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="grid gap-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-rim bg-surface2 px-3.5 py-1.5 font-mono text-xs">
          <span
            className={`inline-block h-[7px] w-[7px] rounded-full ${protocol.isLoading ? 'bg-muted' : 'dot-pulse bg-accent2 shadow-[0_0_8px_#4fd1a5]'}`}
          />
          {protocol.isLoading ? t.header.loading : t.header.protocolActive}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-rim bg-surface2 px-3.5 py-1.5 font-mono text-xs">
          <span
            className={`dot-pulse inline-block h-[7px] w-[7px] rounded-full ${paused ? 'bg-accent3 shadow-[0_0_8px_#e85447]' : 'bg-accent2 shadow-[0_0_8px_#4fd1a5]'}`}
          />
          <span>{paused ? t.header.paused : t.header.live}</span>
        </div>

        {/* ETH wallet button */}
        {walletChain === 'eth' &&
          (isConnected ? (
            <button
              onClick={handleConnectEth}
              className="cursor-pointer rounded-lg border-none bg-accent2 px-[18px] py-2 font-sans text-[13px] font-bold text-black transition-all hover:-translate-y-px hover:bg-[#6de4b8]"
            >
              ⟠ {address?.slice(0, 6)}…{address?.slice(-4)} · {t.header.disconnect}
            </button>
          ) : connectors.length === 0 ? (
            <button
              disabled
              className="cursor-not-allowed rounded-lg border border-rim bg-surface2 px-[18px] py-2 font-sans text-[13px] font-bold text-muted opacity-60"
            >
              {t.header.noWalletDetected}
            </button>
          ) : (
            <button
              onClick={handleConnectEth}
              className="cursor-pointer rounded-lg border-none bg-accent px-[18px] py-2 font-sans text-[13px] font-bold text-black transition-all hover:-translate-y-px hover:bg-[#f0d060]"
            >
              {t.header.connect}
            </button>
          ))}

        {/* Tron wallet button */}
        {walletChain === 'tron' &&
          (tronWallet.isConnected ? (
            <button
              onClick={handleConnectTron}
              className="cursor-pointer rounded-lg border-none bg-red-400 px-[18px] py-2 font-sans text-[13px] font-bold text-black transition-all hover:-translate-y-px hover:bg-red-300"
            >
              ◈ {tronWallet.address?.slice(0, 6)}…{tronWallet.address?.slice(-4)} ·{' '}
              {t.header.disconnectTron}
            </button>
          ) : tronProviders.length > 0 ? (
            <button
              onClick={handleConnectTron}
              className="cursor-pointer rounded-lg border border-rim bg-surface2 px-[18px] py-2 font-sans text-[13px] font-bold text-muted transition-all hover:border-accent/40 hover:text-ink"
            >
              {t.header.connectTronLink}
            </button>
          ) : (
            <button
              disabled
              className="cursor-not-allowed rounded-lg border border-rim bg-surface2 px-[18px] py-2 font-sans text-[13px] font-bold text-muted opacity-60"
            >
              {t.header.installTronLink}
            </button>
          ))}

        {/* Chain switcher — right-aligned */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-rim bg-surface2 p-1">
          <button
            onClick={() => handleSwitchChain('eth')}
            className={`cursor-pointer rounded-md border-none px-4 py-1.5 font-mono text-xs font-bold transition-all ${
              walletChain === 'eth' ? 'bg-accent text-black' : 'bg-transparent text-muted hover:text-ink'
            }`}
          >
            ⟠ {t.chainSwitch.eth}
          </button>
          <button
            onClick={() => handleSwitchChain('tron')}
            className={`cursor-pointer rounded-md border-none px-4 py-1.5 font-mono text-xs font-bold transition-all ${
              walletChain === 'tron'
                ? 'bg-red-400 text-black'
                : 'bg-transparent text-muted hover:text-ink'
            }`}
          >
            ◈ {t.chainSwitch.tron}
          </button>
        </div>
      </div>

      {/* Wallet panel */}
      {walletChain === 'eth' ? <EthWallet /> : <TronWallet tronWallet={tronWallet} onConnect={handleConnectTron} />}

      {/* ETH wallet picker modal */}
      {showEthPicker && (
        <WalletPickerModal
          title={t.header.chooseWallet}
          options={ethConnectorOptions}
          noWalletLabel={t.header.noWalletDetected}
          onSelect={handleSelectEthConnector}
          onClose={() => setShowEthPicker(false)}
        />
      )}

      {/* Tron wallet picker modal */}
      {showTronPicker && (
        <WalletPickerModal
          title={t.header.chooseTronWallet}
          options={tronProviderOptions}
          noWalletLabel={t.header.noWalletDetected}
          onSelect={handleSelectTronProvider}
          onClose={() => setShowTronPicker(false)}
        />
      )}
    </div>
  );
}
