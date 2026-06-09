/** Decode ERC-4337 validationData return value from paymaster validation. */
export interface ValidationDataDecoded {
  aggregator: string;
  validAfter: bigint;
  validUntil: bigint;
  sigFailed: boolean;
}

export function decodeValidationData(data: bigint | string): ValidationDataDecoded {
  const value = typeof data === 'string' ? BigInt(data) : data;
  const sigFailed = (value & 1n) === 1n;
  const validAfter = (value >> 160n) & ((1n << 48n) - 1n);
  const validUntil = (value >> 208n) & ((1n << 48n) - 1n);
  const aggregator = `0x${((value >> 16n) & ((1n << 144n) - 1n)).toString(16).padStart(40, '0')}`;
  return { aggregator, validAfter, validUntil, sigFailed };
}

export function formatTokenAmount(raw: bigint, decimals: number, symbol = ''): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const num = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return `${negative ? '-' : ''}${num}${symbol ? ` ${symbol}` : ''}`;
}

export function formatPriceFromChainlink(answer: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = answer / base;
  const frac = answer % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function stalenessCountdown(validUntil: bigint, nowSec = BigInt(Math.floor(Date.now() / 1000))): string {
  if (validUntil === 0n) return 'no expiry';
  const delta = validUntil - nowSec;
  if (delta <= 0n) return 'stale';
  const secs = Number(delta);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function shortenHex(value: string, head = 6, tail = 4): string {
  if (!value || value.length < head + tail + 2) return value;
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}
