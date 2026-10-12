import { getI18n } from '@/lib/i18n';
import { AuthShell } from '../auth-shell';
import { SignUpForm } from '../login-form';

export default async function SignUpPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t('auth.signUpTitle')} returnTo="/login/signup">
      <SignUpForm />
    </AuthShell>
  );
}
