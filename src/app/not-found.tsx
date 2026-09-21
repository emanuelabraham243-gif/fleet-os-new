import { getI18n } from '@/lib/i18n';
import { LinkButton } from '@/components/ui';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold">{t('states.notFoundTitle')}</h1>
      <p className="text-base text-muted">{t('states.notFoundHint')}</p>
      <LinkButton href="/">{t('nav.home')}</LinkButton>
    </main>
  );
}
