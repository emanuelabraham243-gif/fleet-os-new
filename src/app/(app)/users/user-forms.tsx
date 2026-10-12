'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { FormMessage, SelectField, SubmitButton, TextField, useFormAction } from '@/components/forms-core';
import { checkNewPassword } from '@/lib/auth-rules';
import { PasswordField } from '@/app/login/login-form';
import { addPerson, setTemporaryPassword } from './actions';

export function AddPersonForm() {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(addPerson);
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      <TextField name="full_name" label={t('users.name')} state={state} required maxLength={120} />
      <TextField
        name="phone"
        type="tel"
        label={t('users.phone')}
        hint={t('auth.phoneHint')}
        state={state}
        required
        inputMode="tel"
        autoComplete="off"
      />
      <SelectField
        name="role"
        label={t('users.role')}
        state={state}
        required
        defaultValue="staff"
        options={(['staff', 'admin'] as const).map((r) => ({ value: r, label: label('role', r) }))}
      />
      <SubmitButton>{t('users.add')}</SubmitButton>
    </form>
  );
}

export function TempPasswordForm({ id }: { id: string }) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(setTemporaryPassword);
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
      {state.ok ? (
        <p role="status" className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok-ink">
          {t('users.tempPasswordSaved')}
        </p>
      ) : null}
      <input type="hidden" name="id" value={id} />
      <p className="mb-3 text-sm text-muted">{t('users.tempPasswordHint')}</p>
      <PasswordField
        name="password"
        label={t('auth.newPassword')}
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
      <SubmitButton>{t('users.tempPassword')}</SubmitButton>
    </form>
  );
}
