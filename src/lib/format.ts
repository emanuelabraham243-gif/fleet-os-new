import type { Locale } from './i18n-core';

export const TIME_ZONE = 'Africa/Addis_Ababa';
const DASH = '—';

function intlLocale(locale: Locale): string {
  // Force Latin digits for both locales.
  return locale === 'am' ? 'am-ET-u-nu-latn' : 'en-US-u-nu-latn';
}

/** 'YYYY-MM-DD' in Africa/Addis_Ababa. */
export function todayAddis(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDay(iso: string): number {
  const m = DATE_ONLY.exec(iso.slice(0, 10));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/** Whole days from -> to (date-only, DST-safe via UTC). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(utcDay(toISO) - utcDay(fromISO));
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return DASH;
  const m = DATE_ONLY.exec(iso);
  let d: Date;
  let tz: string;
  if (m) {
    // Date-only: format in UTC so the day never shifts.
    d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    tz = 'UTC';
  } else {
    d = new Date(iso);
    tz = TIME_ZONE;
  }
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: tz,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** 'YYYY-MM' -> localized "Month Year" (e.g. "Mar 2026"). */
export function formatMonth(ym: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return DASH;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', year: 'numeric', month: 'short' }).format(d);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatNumber(n: number | null | undefined, locale: Locale, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Money is integer cents. en: "ETB 12,345.00"; am: "12,345.00 ብር". */
export function formatEtb(cents: number | null | undefined, locale: Locale): string {
  if (cents == null || !Number.isFinite(cents)) return DASH;
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const wholeStr = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(whole);
  const num = `${wholeStr}.${frac}`;
  const sign = neg ? '-' : '';
  return locale === 'am' ? `${sign}${num} ብር` : `${sign}ETB ${num}`;
}

export function formatKm(n: number | null | undefined, locale: Locale): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const num = formatNumber(n, locale, 0);
  return locale === 'am' ? `${num} ኪ.ሜ` : `${num} km`;
}
