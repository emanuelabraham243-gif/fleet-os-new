import { getI18n } from '@/lib/i18n';
import { AuthShell } from './auth-shell';
import { SignInForm } from './login-form';

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t('auth.title')} returnTo="/login">
      <SignInForm />
    </AuthShell>
  );
}
