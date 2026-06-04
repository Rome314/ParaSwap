export function fmt(n: number) {
  return Math.round(n).toLocaleString('en');
}

export function fmtRaw(raw: string | undefined): string {
  if (!raw || raw === '0') return '0';
  const n = BigInt(raw);
  const DECIMALS = 1_000_000n;
  const intPart = n / DECIMALS;
  const fracPart = n % DECIMALS;
  const fracStr = fracPart.toString().padStart(6, '0').slice(0, 2).replace(/0+$/, '');
  const intFormatted = intPart.toLocaleString('en');
  return fracStr ? `${intFormatted}.${fracStr}` : intFormatted;
}

export function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}
