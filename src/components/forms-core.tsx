'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n-client';
import type { FormState } from '@/lib/action-helpers';
import { voidRecord } from '@/app/(app)/actions';

export function useFormAction(
  action: (prev: FormState, fd: FormData) => Promise<FormState>,
) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return { state, formAction, pending };
}

type BaseProps = {
  name: string;
  label: string;
  state: FormState;
  required?: boolean;
  defaultValue?: string | number | null;
  hint?: string;
};

const inputClass =
  'block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-foreground placeholder:text-muted';

type Render = (a: {
  id: string;
  describedBy?: string;
  invalid: boolean;
  value: string | undefined;
}) => ReactNode;

function Field({
  name,
  label,
  state,
  required,
  hint,
  children,
}: Omit<BaseProps, 'defaultValue'> & { children: Render }) {
  const { t } = useI18n();
  const id = `f-${name}`;
  const errKey = state.fieldErrors?.[name];
  const value = state.values?.[name];
  const describedBy =
    [hint ? `${id}-hint` : '', errKey ? `${id}-err` : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-base font-medium">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(errKey), value })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {errKey ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-bad-ink">
          {t('errors.' + errKey)}
        </p>
      ) : null}
    </div>
  );
}

type InputExtra = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'defaultValue' | 'required' | 'id' | 'type'
>;

function dv(value: string | undefined, def: string | number | null | undefined) {
  return value ?? (def == null ? '' : String(def));
}

export function TextField(props: BaseProps & InputExtra) {
  const { name, label, state, required, defaultValue, hint, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid, value }) => (
        <input
          {...rest}
          id={id}
          name={name}
          type="text"
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={dv(value, defaultValue)}
          className={inputClass}
        />
      )}
    </Field>
  );
}

export function NumberField(props: BaseProps & InputExtra) {
  const { name, label, state, required, defaultValue, hint, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid, value }) => (
        <input
          {...rest}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={dv(value, defaultValue)}
          className={`${inputClass} tabular-nums`}
        />
      )}
    </Field>
  );
}

export function DateField(props: BaseProps & InputExtra) {
  const { name, label, state, required, defaultValue, hint, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid, value }) => (
        <input
          {...rest}
          id={id}
          name={name}
          type="date"
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={dv(value, defaultValue)}
          className={inputClass}
        />
      )}
    </Field>
  );
}

export function SelectField(
  props: BaseProps & {
    options: { value: string; label: string }[];
    placeholder?: string;
  } & Omit<
      React.SelectHTMLAttributes<HTMLSelectElement>,
      'name' | 'defaultValue' | 'required' | 'id'
    >,
) {
  const { name, label, state, required, defaultValue, hint, options, placeholder, ...rest } =
    props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid, value }) => (
        <select
          {...rest}
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={dv(value, defaultValue)}
          className={inputClass}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField(
  props: BaseProps &
    Omit<
      React.TextareaHTMLAttributes<HTMLTextAreaElement>,
      'name' | 'defaultValue' | 'required' | 'id'
    >,
) {
  const { name, label, state, required, defaultValue, hint, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid, value }) => (
        <textarea
          rows={3}
          {...rest}
          id={id}
          name={name}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={dv(value, defaultValue)}
          className={`${inputClass} min-h-24`}
        />
      )}
    </Field>
  );
}

export function FileField(props: BaseProps & InputExtra) {
  const { name, label, state, required, hint, defaultValue, ...rest } = props;
  void defaultValue;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          name={name}
          type="file"
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-muted-soft file:px-3 file:py-2`}
        />
      )}
    </Field>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 py-2 text-base font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
    >
      {pending ? t('common.saving') : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  const { t } = useI18n();
  return (
    <div aria-live="polite">
      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink"
        >
          {t('errors.' + state.error)}
        </p>
      ) : null}
    </div>
  );
}

export function ConfirmSaveButton() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      name="confirm"
      value="1"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-5 py-2 text-base font-semibold text-foreground hover:bg-muted-soft disabled:opacity-60 sm:w-auto"
    >
      {t('errors.saveAnyway')}
    </button>
  );
}

export function VoidForm({
  table,
  id,
  returnTo,
}: {
  table: string;
  id: string;
  returnTo: string;
}) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(voidRecord);
  return (
    <details className="rounded-xl border border-line bg-surface p-3">
      <summary className="flex min-h-12 cursor-pointer items-center text-base font-medium text-bad-ink">
        {t('void.title')}
      </summary>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <FormMessage state={state} />
        <TextField
          name="reason"
          label={t('void.reasonLabel')}
          state={state}
          required
          minLength={3}
        />
        <SubmitButton>{t('void.confirm')}</SubmitButton>
      </form>
    </details>
  );
}
