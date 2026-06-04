export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 font-mono text-[11px] tracking-[2px] text-muted uppercase">
      {children}
      <span className="h-px flex-1 bg-rim" />
    </div>
  );
}

export function Inp({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`flex-1 rounded-lg border border-rim bg-surface px-3.5 py-2.5 font-mono text-[13px] text-ink transition-colors outline-none placeholder:text-muted focus:border-accent ${className}`}
      onWheel={props.type === 'number' ? (e) => e.currentTarget.blur() : undefined}
      {...props}
    />
  );
}

export function Btn({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: {
  variant?: 'primary' | 'success' | 'danger' | 'outline' | 'ghost';
  size?: 'md' | 'sm';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'border-none rounded-lg font-sans font-bold cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';
  const sizes = { md: 'px-[18px] py-2.5 text-[13px]', sm: 'px-3.5 py-[7px] text-xs' };
  const variants = {
    primary: 'bg-accent text-black hover:bg-[#f0d060] hover:-translate-y-px',
    success: 'bg-accent2 text-black hover:bg-[#6de4b8]',
    danger: 'bg-accent3 text-white hover:bg-[#f06458]',
    outline: 'bg-transparent text-accent border border-accent hover:bg-accent/10',
    ghost: 'bg-surface2 text-muted border border-rim hover:text-ink',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
  );
}

