import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/nav';
import { OfflineBanner } from '@/components/offline-banner';
import { LanguageToggle } from '@/components/shell-controls';

async function unreadCount(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from('v_notifications')
      .select('delivery_id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .in('reminder_status', ['PENDING', 'SCHEDULED'])
      .neq('delivery_status', 'READ');
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await requireViewer();
  const { t } = await getI18n();
  const unread = await unreadCount(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-3 focus:text-on-brand"
      >
        {t('shell.skipToContent')}
      </a>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-line bg-surface px-4">
        <Link href="/" className="min-w-0 leading-tight">
          <span className="block truncate text-lg font-bold text-brand-ink">
            {t('shell.appName')}
          </span>
          <span className="block truncate text-sm text-muted">{profile.org_name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/notifications"
            aria-label={
              unread > 0
                ? `${t('shell.notificationsLabel')} (${unread})`
                : t('shell.notificationsLabel')
            }
            className="relative inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-line hover:bg-muted-soft"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0" />
            </svg>
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-bad-ink px-1 text-center text-xs font-bold leading-5 text-background">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
          <LanguageToggle />
          <Link
            href="/account"
            aria-label={t('nav.account')}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-line hover:bg-muted-soft"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0116 0" />
            </svg>
          </Link>
        </div>
      </header>
      {profile.is_demo ? (
        <div className="bg-info-soft px-4 py-2 text-center text-base font-medium text-info-ink">
          {t('common.demoBanner')}
        </div>
      ) : null}
      <OfflineBanner />
      <div className="flex flex-1">
        <AppNav />
        <main id="main" className="min-w-0 flex-1 p-4 pb-28 md:pb-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
