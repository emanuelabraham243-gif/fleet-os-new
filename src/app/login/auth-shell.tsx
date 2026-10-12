import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { Card } from '@/components/ui';
import { LanguageToggle, SignOutButton } from '@/components/shell-controls';

/** Frame for the signed-out screens: app name, language switch, one card. */
export async function AuthShell({
  title,
  returnTo,
  children,
}: {
  title: string;
  returnTo: string;
  children: ReactNode;
}) {
  const viewer = await getViewer();
  if (viewer?.profile) redirect('/');
  const { t } = await getI18n();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-brand-ink">{t('shell.appName')}</span>
        <LanguageToggle returnTo={returnTo} />
      </div>
      <Card>
        <h1 className="mb-4 text-2xl font-bold leading-snug">{title}</h1>
        {viewer ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-base font-medium text-warn-ink">
              {t('auth.noProfile')}
            </p>
            <SignOutButton />
          </div>
        ) : (
          children
        )}
      </Card>
    </main>
  );
}
