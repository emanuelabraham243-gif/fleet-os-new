// Pure i18n helpers: no next/* imports, safe for client components and tests.
import type { enMerged } from '../locales/index';

export const LOCALES = ['am', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'am';
export const LANG_COOKIE = 'fleetos_lang';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

export type Dict = Widen<typeof enMerged>;

function lookup(dict: unknown, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function translate(
  dict: Dict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const found = lookup(dict, key);
  if (typeof found !== 'string') return key;
  if (!vars) return found;
  return found.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export function enumLabel(
  dict: Dict,
  group: string,
  code: string | null | undefined,
): string {
  if (code == null) return '';
  const found = lookup(dict, `enums.${group}.${code}`);
  return typeof found === 'string' ? found : code;
}
