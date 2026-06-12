import { useState } from 'react';
import type { DecodedCall } from '../../../../lib/aa/decodeCalldata';
import { labelForAddress } from '../../../../lib/aa/decodeCalldata';
import { shortenHex } from '../../../../lib/aa/decode';

function DecodedNode({ call, depth = 0 }: { call: DecodedCall; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (call.children?.length ?? 0) > 0;
  const targetLabel = call.to ? (labelForAddress(call.to) ?? shortenHex(call.to)) : undefined;

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-border pl-2' : ''}>
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left text-xs hover:bg-muted/50 rounded px-1 py-0.5"
        onClick={() => hasChildren && setOpen((v) => !v)}
        disabled={!hasChildren}
      >
        {hasChildren && <span className="text-muted-foreground w-3">{open ? '▼' : '▶'}</span>}
        <span className="font-mono font-medium text-primary">
          {call.contractName ?? 'Unknown'}
          {call.functionName ? `.${call.functionName}` : ''}
        </span>
        {targetLabel && <span className="text-muted-foreground">→ {targetLabel}</span>}
        {call.value !== undefined && call.value > 0n && (
          <span className="text-muted-foreground">value={call.value.toString()}</span>
        )}
      </button>
      {call.args.length > 0 && (
        <ul className="ml-4 my-1 space-y-0.5 text-xs font-mono text-muted-foreground">
          {call.args.map((arg) => (
            <li key={arg.name}>
              <span className="text-foreground">{arg.name}</span>
              <span className="opacity-60"> ({arg.type})</span>: {arg.value}
            </li>
          ))}
        </ul>
      )}
      {open &&
        call.children?.map((child, i) => (
          <DecodedNode key={`${child.selector ?? child.raw}-${i}`} call={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function DecodedCalldata({ decoded, label }: { decoded: DecodedCall | null; label?: string }) {
  if (!decoded) return null;
  return (
    <div className="rounded border border-border bg-muted/30 p-2">
      {label && <p className="text-xs font-medium mb-1">{label}</p>}
      <DecodedNode call={decoded} />
    </div>
  );
}
