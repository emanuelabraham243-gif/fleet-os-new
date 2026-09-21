import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { Card, PageHeader, Section } from '@/components/ui';
import { LanguageToggle, SignOutButton } from '@/components/shell-controls';
import { PasswordForm } from './password-form';

export default async function AccountPage() {
  const { user, profile } = await requireViewer();
  const { t, label, locale } = await getI18n();

  return (
    <>
      <PageHeader title={t('account.title')} />
      <Card className="mb-6">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted">{t('auth.email')}</dt>
            <dd className="break-all text-base font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('account.role')}</dt>
            <dd className="text-base font-medium">{label('role', profile.role)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('account.organization')}</dt>
            <dd className="text-base font-medium">{profile.org_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('account.language')}</dt>
            <dd className="mt-1 flex items-center gap-3">
              <span className="text-base font-medium">{locale === 'am' ? 'አማርኛ' : 'English'}</span>
              <LanguageToggle returnTo="/account" />
            </dd>
          </div>
        </dl>
      </Card>
      <Section title={t('account.setPassword')}>
        <Card>
          <PasswordForm />
        </Card>
      </Section>
      <SignOutButton />
    </>
  );
}
