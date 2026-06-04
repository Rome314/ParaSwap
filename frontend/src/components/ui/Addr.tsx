import { useState } from 'react';

export function CopyableAddr({ addr, href }: { addr: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-rim bg-surface2 px-3.5 py-2.5 font-mono text-[11px] text-accent">
      <span className="mr-2 truncate">{addr}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted transition-colors hover:text-accent"
            title="View on explorer"
          >
            ↗
          </a>
        )}
        <button
          onClick={copy}
          className="cursor-pointer border-none bg-none text-xs text-muted transition-colors hover:text-accent"
        >
          {copied ? '✅' : '📋'}
        </button>
      </div>
    </div>
  );
}
