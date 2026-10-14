/**
 * Ethiopian (Amete Mihret) calendar <-> ISO 'YYYY-MM-DD' (Gregorian), via Julian Day Numbers.
 * 13 months: 12 of 30 days, then Pagume with 5 days (6 in a leap year, when year % 4 === 3).
 * Storage stays Gregorian ISO; only the screens that ask for it show and take Ethiopian dates.
 */
import type { Locale } from './i18n-core';

export type EthDate = { year: number; month: number; day: number };

const EPOCH = 1_724_221; // JDN of 1 Meskerem, year 1 (Amete Mihret)

export const ETH_MONTHS: Record<Locale, readonly string[]> = {
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'],
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
};

export function isEthLeap(year: number): boolean {
  return year % 4 === 3;
}

export function ethMonthLength(year: number, month: number): number {
  return month < 13 ? 30 : isEthLeap(year) ? 6 : 5;
}

export function isValidEth({ year, month, day }: EthDate): boolean {
  return (
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    year >= 1 && month >= 1 && month <= 13 && day >= 1 && day <= ethMonthLength(year, month)
  );
}

function ethToJdn({ year, month, day }: EthDate): number {
  return EPOCH + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + (day - 1);
}

const DAY_MS = 86_400_000;
const UNIX_JDN = 2_440_588; // JDN of 1970-01-01

export function ethToIso(d: EthDate): string {
  return new Date((ethToJdn(d) - UNIX_JDN) * DAY_MS).toISOString().slice(0, 10);
}

export function isoToEth(iso: string): EthDate {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const jdn = Date.UTC(y, m - 1, d) / DAY_MS + UNIX_JDN;
  const n = jdn - EPOCH; // days since 1 Meskerem 1
  const start = (yr: number) => 365 * (yr - 1) + Math.floor(yr / 4);
  let year = Math.floor(n / 365.25) + 1;
  while (start(year) > n) year--;
  while (start(year + 1) <= n) year++;
  const dayOfYear = n - start(year);
  return { year, month: Math.floor(dayOfYear / 30) + 1, day: (dayOfYear % 30) + 1 };
}

/** "4 ጥቅምት 2019" / "4 Tikimt 2019"; '—' for no date. */
export function formatEthDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const e = isoToEth(iso);
  return `${e.day} ${ETH_MONTHS[locale][e.month - 1]} ${e.year}`;
}

/**
 * Reads an Ethiopian date sent as three form fields `<name>__d`, `<name>__m`, `<name>__y`.
 * Returns '' when all three are empty, the Gregorian ISO date when valid, or null when invalid.
 */
export function ethDateFromForm(values: Record<string, string | undefined>, name: string): string | null {
  const raw = ['d', 'm', 'y'].map((k) => (values[`${name}__${k}`] ?? '').trim());
  if (raw.every((v) => v === '')) return '';
  if (raw.some((v) => !/^\d+$/.test(v))) return null;
  const [day, month, year] = raw.map(Number);
  const e = { year, month, day };
  return isValidEth(e) ? ethToIso(e) : null;
}
