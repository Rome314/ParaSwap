import { isAddress } from 'ethers';
import { Inp } from '../ui/ui';
import { useLang } from '../../i18n';

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

/**
 * Minimal "paste an address" token picker. A real implementation would have
 * a curated list + on-chain symbol/decimals lookup; for V0 we accept any
 * ERC-20 address and let the Routing API validate it.
 */
export function TokenPicker({ value, onChange, disabled }: Props) {
  const { t } = useLang();
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !isAddress(trimmed);

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] tracking-[1px] text-muted uppercase">
        {t.swap.buyLabel}
      </div>
      <Inp
        placeholder={t.swap.tokenAddrPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      {invalid && (
        <div className="mt-1 font-mono text-[11px] text-accent3">{t.swap.invalidAddr}</div>
      )}
    </div>
  );
}
