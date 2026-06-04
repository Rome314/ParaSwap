import { useLang } from '../../i18n';
import { CopyableAddr } from '../ui/Addr';
import { SUPPORTED_CHAINS, type SupportedEVMChainId } from '../../config/chains';
import type { Addresses } from '../../config/addresses';

type Props = { chainId: SupportedEVMChainId; addresses: Addresses };

export function ChainAddressesSection({ chainId, addresses }: Props) {
  const { t } = useLang();
  const explorerURL = (addr: string) => SUPPORTED_CHAINS[chainId].explorerURL(addr);
  const isTron = SUPPORTED_CHAINS[chainId].isTron;

  const contracts = [
    {
      label: isTron ? t.overview.a7a5TronLabel : t.overview.a7a5EthLabel,
      addr: addresses.A7A5.A7A5,
    },
    ...(addresses.A7A5.WA7A5
      ? [{ label: t.overview.wa7a5EthLabel, addr: addresses.A7A5.WA7A5 }]
      : []),
    {
      label: isTron ? t.overview.tronMulticallLabel : t.overview.multicallLabel,
      addr: addresses.MULTICALL3,
    },
  ];

  return (
    <div className="mt-4 space-y-3">
      {contracts.map(({ label, addr }) => (
        <div key={label}>
          <div className="mb-1 font-mono text-xs text-muted">{label}</div>
          <CopyableAddr addr={addr} href={explorerURL(addr)} />
        </div>
      ))}
    </div>
  );
}
