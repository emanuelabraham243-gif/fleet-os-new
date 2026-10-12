'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { FormMessage, SubmitButton, useFormAction } from '@/components/forms-core';
import { checkNewPassword } from '@/lib/auth-rules';
import { PasswordField } from '@/app/login/login-form';
import { updatePassword } from './actions';

export function PasswordForm() {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(updatePassword);
  const [local, setLocal] = useState<Record<string, string> | null>(null);
  const errors = local ?? state.fieldErrors ?? {};

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const problem = checkNewPassword(String(fd.get('password') ?? ''), String(fd.get('confirm') ?? ''));
    if (problem) {
      e.preventDefault();
      setLocal({ [problem === 'passwordMismatch' ? 'confirm' : 'password']: problem });
    } else {
      setLocal(null);
    }
  };

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate>
      <FormMessage state={state} />
      <div aria-live="polite">
        {state.ok ? (
          <p
            role="status"
            className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok-ink"
          >
            {t('account.passwordSaved')}
          </p>
        ) : null}
      </div>
      <PasswordField
        name="password"
        label={t('account.newPassword')}
        hint={t('auth.passwordRule')}
        error={errors.password}
        autoComplete="new-password"
      />
      <PasswordField
        name="confirm"
        label={t('auth.confirmPassword')}
        error={errors.confirm}
        autoComplete="new-password"
      />
      <SubmitButton>{t('account.setPassword')}</SubmitButton>
    </form>
  );
}
