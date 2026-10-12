import Link from 'next/link';
import { getI18n } from '@/lib/i18n';
import { smsEnabled } from '@/lib/sms';
import { AuthShell } from '../auth-shell';
import { ForgotForm } from '../login-form';

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t('auth.forgotTitle')} returnTo="/login/forgot">
      {smsEnabled() ? (
        <ForgotForm />
      ) : (
        // No SMS service yet: the owner/admin sets a temporary password from the People page.
        <>
          <p role="status" className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-base font-medium text-warn-ink">
            {t('auth.smsUnavailable')}
          </p>
          <Link href="/login" className="inline-flex min-h-12 items-center text-base font-semibold text-brand-ink underline">
            {t('auth.backToSignIn')}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
