'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { FormMessage, SubmitButton, TextField, useFormAction } from '@/components/forms-core';
import { checkNewPassword } from '@/lib/auth-rules';
import type { FormState } from '@/lib/action-helpers';
import { completeReset, requestReset, signIn, signUp } from './actions';

function PhoneField({ state, autoFocus }: { state: FormState; autoFocus?: boolean }) {
  const { t } = useI18n();
  return (
    <TextField
      name="phone"
      type="tel"
      label={t('auth.phone')}
      hint={t('auth.phoneHint')}
      state={state}
      required
      inputMode="tel"
      autoComplete="tel"
      autoFocus={autoFocus}
    />
  );
}

/** Password input with a show/hide button. `error` is an `errors.*` key. */
export function PasswordField({
  name,
  label,
  error,
  autoComplete,
  hint,
}: {
  name: string;
  label: string;
  error?: string;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const [shown, setShown] = useState(false);
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-base font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="block min-h-12 w-full min-w-0 rounded-xl border border-input-border bg-surface px-4 py-2 text-lg"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-controls={id}
          aria-pressed={shown}
          className="min-h-12 shrink-0 rounded-xl border border-line bg-surface px-4 text-base font-semibold hover:bg-muted-soft"
        >
          {shown ? t('auth.hide') : t('auth.show')}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-bad-ink">
          {t(error.includes('.') ? error : 'errors.' + error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Checks length + match in the browser before submitting (the server checks again).
 * Returns [errors to show, submit handler].
 */
function useNewPasswordCheck(serverErrors: FormState['fieldErrors']) {
  const [local, setLocal] = useState<Record<string, string> | null>(null);
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
  return [local ?? serverErrors ?? {}, onSubmit] as const;
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-12 items-center text-base font-semibold text-brand-ink underline">
      {children}
    </Link>
  );
}

export function SignInForm() {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(signIn);
  return (
    <>
      <form action={formAction} noValidate>
        <FormMessage state={state} />
        <PhoneField state={state} autoFocus />
        <PasswordField
          name="password"
          label={t('auth.password')}
          error={state.fieldErrors?.password}
          autoComplete="current-password"
        />
        <SubmitButton>{t('auth.signIn')}</SubmitButton>
      </form>
      <div className="mt-4 flex flex-col">
        <NavLink href="/login/forgot">{t('auth.forgot')}</NavLink>
        <NavLink href="/login/signup">{t('auth.noAccount')}</NavLink>
      </div>
    </>
  );
}

export function SignUpForm() {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(signUp);
  const [errors, onSubmit] = useNewPasswordCheck(state.fieldErrors);
  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate>
        <FormMessage state={state} />
        <PhoneField state={state} autoFocus />
        <PasswordField
          name="password"
          label={t('auth.password')}
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
        <SubmitButton>{t('auth.signUp')}</SubmitButton>
      </form>
      <div className="mt-4">
        <NavLink href="/login">{t('auth.haveAccount')}</NavLink>
      </div>
    </>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const request = useFormAction(requestReset);
  const reset = useFormAction(completeReset);
  const [errors, onSubmit] = useNewPasswordCheck(reset.state.fieldErrors);
  const phone = request.state.ok ? request.state.values?.phone : undefined;

  return (
    <>
      {phone ? (
        <form action={reset.formAction} onSubmit={onSubmit} noValidate>
          <p role="status" className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok-ink">
            {t('auth.codeSent')}
          </p>
          <FormMessage state={reset.state} />
          <input type="hidden" name="phone" value={phone} />
          <TextField
            name="code"
            label={t('auth.code')}
            state={reset.state}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            autoFocus
          />
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
          <SubmitButton>{t('auth.savePassword')}</SubmitButton>
        </form>
      ) : (
        <form action={request.formAction} noValidate>
          <FormMessage state={request.state} />
          <PhoneField state={request.state} autoFocus />
          <SubmitButton>{t('auth.sendCode')}</SubmitButton>
        </form>
      )}
      <div className="mt-4">
        <NavLink href="/login">{t('auth.backToSignIn')}</NavLink>
      </div>
    </>
  );
}
