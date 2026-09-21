'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { enumLabel, translate, type Dict, type Locale } from './i18n-core';

export type I18nValue = {
  locale: Locale;
  dict: Dict;
  t: (key: string, vars?: Record<string, string | number>) => string;
  label: (group: string, code: string | null | undefined) => string;
};

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dict,
      t: (key, vars) => translate(dict, key, vars),
      label: (group, code) => enumLabel(dict, group, code),
    }),
    [locale, dict],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside I18nProvider');
  return v;
}
