'use client';

import { useI18n } from '@/lib/i18n-client';
import { FormMessage, SubmitButton, TextField, useFormAction } from '@/components/forms-core';
import { sendMagicLink, signInWithPassword } from './actions';

export function LoginForm() {
  const { t } = useI18n();
  const pw = useFormAction(signInWithPassword);
  const ml = useFormAction(sendMagicLink);

  return (
    <div className="space-y-6">
      <form action={pw.formAction} noValidate>
        <FormMessage state={pw.state} />
        <TextField
          name="email"
          label={t('auth.email')}
          state={pw.state}
          required
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
        />
        <PasswordInput label={t('auth.password')} fieldError={pw.state.fieldErrors?.password} />
        <SubmitButton>{t('auth.signIn')}</SubmitButton>
      </form>

      <p className="text-center text-muted" aria-hidden="true">
        {t('auth.or')}
      </p>

      <form action={ml.formAction} noValidate>
        <div aria-live="polite">
          {ml.state.ok ? (
            <p
              role="status"
              className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok-ink"
            >
              {t('auth.checkEmail')}
            </p>
          ) : null}
        </div>
        <TextField
          name="email"
          label={t('auth.email')}
          state={ml.state}
          required
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
        />
        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft"
        >
          {t('auth.magicLink')}
        </button>
      </form>
    </div>
  );
}

function PasswordInput({ label, fieldError }: { label: string; fieldError?: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-4">
      <label htmlFor="f-password" className="mb-1 block text-base font-medium">
        {label}
      </label>
      <input
        id="f-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? 'f-password-err' : undefined}
        className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
      />
      {fieldError ? (
        <p id="f-password-err" role="alert" className="mt-1 text-sm font-medium text-bad-ink">
          {t('errors.' + fieldError)}
        </p>
      ) : null}
    </div>
  );
}
