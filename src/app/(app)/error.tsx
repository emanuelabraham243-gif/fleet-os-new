'use client';

import { useI18n } from '@/lib/i18n-client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <h1 className="text-xl font-bold">{t('states.errorTitle')}</h1>
      <p className="mt-2 text-base text-muted">{t('states.errorHint')}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-on-brand hover:bg-brand-strong"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}
