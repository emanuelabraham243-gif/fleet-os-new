'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-client';

const svg = (d: ReactNode) => (
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
    {d}
  </svg>
);

const ICONS: Record<string, ReactNode> = {
  home: svg(<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />),
  vehicles: svg(
    <>
      <path d="M3 16V9a1 1 0 011-1h9v8M13 11h4l4 3v2h-8" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>,
  ),
  trips: svg(
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h6a3 3 0 010 6H10a3 3 0 000 6h6" />
    </>,
  ),
  maintenance: svg(
    <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z" />,
  ),
  expenses: svg(
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>,
  ),
  documents: svg(
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>,
  ),
};

const ITEMS = [
  { href: '/', key: 'home' },
  { href: '/vehicles', key: 'vehicles' },
  { href: '/trips', key: 'trips' },
  { href: '/maintenance', key: 'maintenance' },
  { href: '/expenses', key: 'expenses' },
  { href: '/documents', key: 'documents' },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* Phones: bottom tab bar */}
      <nav
        aria-label={t('shell.menu')}
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden"
      >
        <ul className="grid grid-cols-6">
          {ITEMS.map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] leading-tight ${
                    active ? 'font-bold text-brand-ink' : 'text-muted'
                  }`}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 top-0 h-1 rounded-b bg-brand"
                    />
                  ) : null}
                  {ICONS[it.key]}
                  <span className="max-w-full truncate">{t('nav.' + it.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tablet/desktop: sidebar */}
      <nav
        aria-label={t('shell.menu')}
        className="hidden w-56 shrink-0 border-r border-line bg-surface md:block"
      >
        <ul className="sticky top-16 space-y-1 p-3">
          {ITEMS.map((it) => {
            const active = isActive(it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base ${
                    active
                      ? 'border-l-4 border-brand bg-muted-soft font-bold text-brand-ink'
                      : 'text-foreground hover:bg-muted-soft'
                  }`}
                >
                  {ICONS[it.key]}
                  {t('nav.' + it.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
