import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { Card } from '@/components/ui';
import { LanguageToggle, SignOutButton } from '@/components/shell-controls';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (viewer?.profile) redirect('/');

  const { t } = await getI18n();
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-brand-ink">{t('shell.appName')}</span>
        <LanguageToggle returnTo="/login" />
      </div>
      <Card>
        <h1 className="mb-4 text-xl font-bold leading-snug">{t('auth.title')}</h1>
        {viewer ? (
          <div className="space-y-4">
            <p
              role="alert"
              className="rounded-xl bg-warn-soft px-4 py-3 text-base font-medium text-warn-ink"
            >
              {t('auth.noProfile')}
            </p>
            <SignOutButton />
          </div>
        ) : (
          <>
            {error === 'no_profile' ? (
              <p
                role="alert"
                className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-base font-medium text-warn-ink"
              >
                {t('auth.noProfile')}
              </p>
            ) : error === 'callback' ? (
              <p
                role="alert"
                className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink"
              >
                {t('errors.generic')}
              </p>
            ) : null}
            <LoginForm />
          </>
        )}
      </Card>
    </main>
  );
}
