import { useMemo } from 'react';
import { decodeCalldata, labelForAddress, type DecodedCall } from '../../lib/aa/decodeCalldata';
import { shortenHex } from '../../lib/aa/decode';

function CallNode({ call, depth }: { call: DecodedCall; depth: number }) {
  const target = call.to
    ? `${labelForAddress(call.to) ?? shortenHex(call.to, 8, 6)}`
    : undefined;

  return (
    <div className={depth > 0 ? 'ml-3 border-l pl-3' : ''}>
      <p className="text-xs">
        <span className="font-semibold">{call.functionName ?? '(raw)'}</span>
        {call.contractName && <span className="text-muted-foreground"> · {call.contractName}</span>}
        {target && <span className="text-muted-foreground"> @ {target}</span>}
        {call.value !== undefined && call.value > 0n && (
          <span className="text-muted-foreground"> · value={call.value.toString()} wei</span>
        )}
      </p>
      {call.args.length > 0 && (
        <table className="mt-1 w-full text-xs">
          <tbody>
            {call.args.map((arg) => (
              <tr key={arg.name}>
                <td className="pr-2 align-top text-muted-foreground whitespace-nowrap">
                  {arg.name} <span className="opacity-60">({arg.type})</span>
                </td>
                <td className="font-mono break-all">{arg.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {call.children?.map((child, i) => (
        <CallNode key={i} call={child} depth={depth + 1} />
      ))}
      {depth === 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">raw calldata</summary>
          <pre className="overflow-auto rounded bg-muted p-2 text-xs break-all max-h-32">{call.raw}</pre>
        </details>
      )}
    </div>
  );
}

/** Decoded, recursive view of outgoing calldata — shown before anything is sent. */
export function DecodedCalldataView({
  data,
  to,
  value,
}: {
  data: string;
  to?: string;
  value?: bigint;
}) {
  const decoded = useMemo(() => decodeCalldata(data, to, value ?? 0n), [data, to, value]);
  return (
    <div className="rounded border p-2 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Decoded calldata</p>
      <CallNode call={decoded} depth={0} />
    </div>
  );
}
