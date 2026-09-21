'use client';

import { useId } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { FormMessage, SubmitButton, useFormAction } from '@/components/forms-core';
import { updatePassword } from './actions';

export function PasswordForm() {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(updatePassword);
  const id = useId();
  const err = state.fieldErrors?.password;
  return (
    <form action={formAction} noValidate>
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
      <div className="mb-4">
        <label htmlFor={id} className="mb-1 block text-base font-medium">
          {t('account.newPassword')}
        </label>
        <input
          id={id}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          className="block min-h-12 w-full rounded-xl border border-input-border bg-surface px-4 py-2 text-base"
        />
        {err ? (
          <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-bad-ink">
            {t('account.passwordTooShort')}
          </p>
        ) : null}
      </div>
      <SubmitButton>{t('account.setPassword')}</SubmitButton>
    </form>
  );
}
