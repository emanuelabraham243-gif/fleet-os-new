/** Money helpers. Amounts are handled as integer cents; never sum floats. */

export function toCents(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function sumCents(values: (number | null | undefined)[]): number {
  let total = 0;
  for (const v of values) if (v != null) total += v;
  return total;
}

/** Returns a normalized decimal string ("1234.5") or null if the input is not acceptable. */
export function parseDecimal(
  input: string,
  { maxInt, maxFrac }: { maxInt: number; maxFrac: number },
): string | null {
  const s = input.replace(/[,\s]/g, '');
  if (s === '') return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const int = m[1].replace(/^0+(?=\d)/, '');
  const frac = m[2] ?? '';
  if (int.length > maxInt || frac.length > maxFrac) return null;
  return frac ? `${int}.${frac}` : int;
}

/** Positive amount, up to 12 integer digits and 2 decimals. */
export function parseMoney(input: string): string | null {
  const v = parseDecimal(input, { maxInt: 12, maxFrac: 2 });
  if (v === null) return null;
  return Number(v) > 0 ? v : null;
}
