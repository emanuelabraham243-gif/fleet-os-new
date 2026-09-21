'use client';

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n-client';
import { formValues, type FormState } from '@/lib/action-helpers';
import { voidRecord } from '@/app/(app)/actions';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Next signals redirect/notFound/etc. by throwing errors whose digest starts with NEXT_. */
function isFrameworkSignal(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}

export function useFormAction(
  action: (prev: FormState, fd: FormData) => Promise<FormState>,
) {
  const formRef = useRef<Element | null>(null);

  const safeAction = useCallback(
    async (prev: FormState, fd: FormData): Promise<FormState> => {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      formRef.current = active?.closest('form') ?? null;
      try {
        return await action(prev, fd);
      } catch (e) {
        if (isFrameworkSignal(e)) throw e;
        const offline =
          (typeof navigator !== 'undefined' && !navigator.onLine) || e instanceof TypeError;
        return { error: offline ? 'offline' : 'generic', values: formValues(fd) };
      }
    },
    [action],
  );

  const [state, formAction, pending] = useActionState(safeAction, {} as FormState);

  const initial = useRef(state);
  useEffect(() => {
    if (state === initial.current) return;
    const failed =
      Boolean(state.error) ||
      Boolean(state.needsConfirm) ||
      Object.keys(state.fieldErrors ?? {}).length > 0;
    if (!failed) return;
    const scope: ParentNode = formRef.current ?? document;
    const target =
      scope.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      scope.querySelector<HTMLElement>('[data-form-message]');
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [state]);

  return { state, formAction, pending };
}

/** Keys containing a '.' are full dictionary keys; others live in the `errors` namespace. */
function useResolve() {
  const { t } = useI18n();
  return (key: string) => t(key.includes('.') ? key : 'errors.' + key);
}

type BaseProps = {
  name: string;
  label: string;
  state: FormState;
  required?: boolean;
  defaultValue?: string | number | null;
  hint?: string;
  /** Optional stable DOM id; defaults to a unique generated one. */
  id?: string;
};

const inputClass =
  'block min-h-12 w-full rounded-xl border border-input-border bg-surface px-4 py-2 text-base text-foreground placeholder:text-muted';

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
  id: idProp,
  children,
}: Omit<BaseProps, 'defaultValue'> & { children: Render }) {
  const resolve = useResolve();
  const generated = useId();
  const id = idProp ?? generated;
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
          {resolve(errKey)}
        </p>
      ) : null}
    </div>
  );
}

type InputExtra = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'defaultValue' | 'required' | 'id' | 'type'
>;

type TextType = 'text' | 'email' | 'tel' | 'url' | 'search' | 'password';

function dv(value: string | undefined, def: string | number | null | undefined) {
  return value ?? (def == null ? '' : String(def));
}

export function TextField(props: BaseProps & InputExtra & { type?: TextType }) {
  const {
    name,
    label,
    state,
    required,
    defaultValue,
    hint,
    id: fieldId,
    type = 'text',
    ...rest
  } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
      {({ id, describedBy, invalid, value }) => (
        <input
          {...rest}
          id={id}
          name={name}
          type={type}
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
  const { name, label, state, required, defaultValue, hint, id: fieldId, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
      {({ id, describedBy, invalid, value }) => (
        <input
          inputMode="decimal"
          autoComplete="off"
          {...rest}
          id={id}
          name={name}
          type="text"
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
  const { name, label, state, required, defaultValue, hint, id: fieldId, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
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
  const {
    name,
    label,
    state,
    required,
    defaultValue,
    hint,
    options,
    placeholder,
    id: fieldId,
    ...rest
  } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
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
  const { name, label, state, required, defaultValue, hint, id: fieldId, ...rest } = props;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
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
  const { name, label, state, required, hint, defaultValue, id: fieldId, ...rest } = props;
  void defaultValue;
  return (
    <Field name={name} label={label} state={state} required={required} hint={hint} id={fieldId}>
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

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const online = useOnline();
  const look =
    variant === 'primary'
      ? 'bg-brand text-on-brand hover:bg-brand-strong'
      : 'border border-line bg-surface text-foreground hover:bg-muted-soft';
  return (
    <button
      type="submit"
      disabled={pending || !online}
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-2 text-base font-semibold disabled:opacity-60 sm:w-auto ${look}`}
    >
      {pending ? t('common.saving') : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  const resolve = useResolve();
  return (
    <div aria-live="polite" data-form-message="" tabIndex={-1}>
      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink"
        >
          {resolve(state.error)}
        </p>
      ) : null}
    </div>
  );
}

export function ConfirmSaveButton() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const online = useOnline();
  return (
    <button
      type="submit"
      name="confirm"
      value="1"
      disabled={pending || !online}
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
