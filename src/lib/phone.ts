/**
 * Ethiopian mobile numbers. Everything is stored as E.164: +251 then 9 digits starting with 9
 * (Ethio Telecom) or 7 (Safaricom Ethiopia), e.g. +251911223344.
 *
 * Accepted input: 0911223344, 0711223344, 911223344, 711223344, 251911223344, +251911223344,
 * 00251911223344 -- with any spaces, dashes, dots or brackets in between.
 */
export function normalizeEthiopianMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\+?[\d\s\-.()]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (!digits.startsWith('251')) return null;
    digits = digits.slice(3);
  } else if (digits.startsWith('00251')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('251') && digits.length === 12) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1);
  }
  if (!/^[79]\d{8}$/.test(digits)) return null;
  return `+251${digits}`;
}

/** +251911223344 -> 0911 223 344 (how people write it locally). */
export function formatEthiopianMobile(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+251(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
