export function StatCard({
  label,
  value,
  sub,
  color = 'text-ink',
  tip,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
  tip?: string;
}) {
  return (
    <div
      className="stat-glow relative cursor-default overflow-hidden rounded-xl border border-rim bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40"
      title={tip}
    >
      <div className="mb-2.5 font-mono text-[10px] tracking-[1.5px] text-muted uppercase">
        {label}
      </div>
      <div className={`mb-1.5 font-mono text-2xl leading-none font-bold ${color}`}>{value}</div>
      <div className="font-mono text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export function RoleCard({
  icon,
  iconBg,
  name,
  desc,
  quorum,
  address,
  href,
}: {
  icon: string;
  iconBg: string;
  name: string;
  desc: string;
  quorum: string;
  address?: string;
  href?: string;
}) {
  function copyAddr() {
    if (address) navigator.clipboard.writeText(address);
  }
  return (
    <div className="mb-2.5 flex items-center gap-4 rounded-xl border border-rim bg-surface2 px-5 py-4 transition-all duration-200 hover:border-accent/30">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-sm font-bold">{name}</div>
        <div className="font-mono text-xs text-muted">{desc}</div>
        {address && (
          <div className="mt-0.5 flex items-center gap-2">
            <button
              onClick={copyAddr}
              className="max-w-full truncate text-left font-mono text-[10px] text-accent transition-colors hover:text-accent/70"
              title={address}
            >
              {address}
            </button>
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[10px] text-muted transition-colors hover:text-accent"
              >
                ↗
              </a>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 rounded-md border border-accent/20 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent">
        {quorum}
      </div>
    </div>
  );
}
