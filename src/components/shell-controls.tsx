'use client';

import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n-client';
import { setLanguage, signOut } from '@/app/(app)/actions';

export function LanguageToggle({
  action = setLanguage,
  returnTo,
}: {
  action?: (fd: FormData) => Promise<void>;
  returnTo?: string;
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const next = locale === 'am' ? 'en' : 'am';
  const visible = next === 'en' ? 'EN' : 'አማ';
  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Preserve the current query string (pathname alone drops filters).
        const input = e.currentTarget.elements.namedItem('returnTo') as HTMLInputElement | null;
        if (input && !returnTo) input.value = window.location.pathname + window.location.search;
      }}
    >
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="returnTo" value={returnTo ?? pathname} />
      <button
        type="submit"
        aria-label={`${t('shell.switchLanguage')} (${visible})`}
        className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-line px-3 text-base font-semibold hover:bg-muted-soft"
      >
        {visible}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const { t } = useI18n();
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft sm:w-auto"
      >
        {t('auth.signOut')}
      </button>
    </form>
  );
}
