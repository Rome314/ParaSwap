interface WalletOption {
  id: string;
  name: string;
  icon?: string;
}

interface Props {
  title: string;
  options: WalletOption[];
  noWalletLabel: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function WalletPickerModal({ title, options, noWalletLabel, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="min-w-[260px] rounded-xl border border-rim bg-surface2 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 font-mono text-sm font-bold text-ink">{title}</p>

        {options.length === 0 ? (
          <p className="text-center font-sans text-sm text-muted">{noWalletLabel}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((opt) => (
              <li key={opt.id}>
                <button
                  onClick={() => onSelect(opt.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-rim bg-surface px-4 py-2.5 font-sans text-sm font-semibold text-ink transition-all hover:border-accent/50 hover:bg-surface2"
                >
                  {opt.icon && (
                    <img src={opt.icon} alt={opt.name} className="h-6 w-6 rounded-full" />
                  )}
                  {opt.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full cursor-pointer rounded-lg border border-rim bg-transparent py-1.5 font-sans text-xs text-muted transition-all hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
