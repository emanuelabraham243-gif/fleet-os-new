import { cookies } from 'next/headers';
import { dictionaries } from '../locales/index';
import {
  DEFAULT_LOCALE,
  LANG_COOKIE,
  enumLabel,
  isLocale,
  translate,
  type Dict,
  type Locale,
} from './i18n-core';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export type I18n = {
  locale: Locale;
  dict: Dict;
  t: (key: string, vars?: Record<string, string | number>) => string;
  label: (group: string, code: string | null | undefined) => string;
};

export async function getI18n(): Promise<I18n> {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return {
    locale,
    dict,
    t: (key, vars) => translate(dict, key, vars),
    label: (group, code) => enumLabel(dict, group, code),
  };
}
