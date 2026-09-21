'use client';

import { useId } from 'react';
import { useI18n } from '@/lib/i18n-client';
import type { FormState } from '@/lib/action-helpers';
import {
  ConfirmSaveButton,
  DateField,
  FormMessage,
  NumberField,
  SelectField,
  SubmitButton,
  TextField,
  useFormAction,
} from '@/components/forms-core';
import { createExpense, createRevenue } from './actions';

const CATEGORIES = [
  'FUEL',
  'DRIVER_ALLOWANCE',
  'TOLL',
  'LOADING',
  'PARKING',
  'REPAIR',
  'FINE',
  'OTHER',
] as const;

export function ExpenseForm({
  trips,
  defaultTrip,
  today,
}: {
  trips: { value: string; label: string }[];
  defaultTrip?: string;
  today: string;
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createExpense);
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      <SelectField
        name="trip_id"
        label={t('expenses.tripLabel')}
        state={state}
        required
        defaultValue={defaultTrip}
        placeholder={t('expenses.chooseTrip')}
        options={trips}
      />
      <SelectField
        name="category"
        label={t('expenses.category')}
        state={state}
        required
        defaultValue="FUEL"
        options={CATEGORIES.map((c) => ({ value: c, label: label('expenseCategory', c) }))}
      />
      <NumberField name="amount" label={t('expenses.amount')} state={state} required />
      <DateField name="expense_date" label={t('expenses.date')} state={state} required defaultValue={today} />
      <TextField name="description" label={t('expenses.description')} state={state} maxLength={200} />
      <div className="flex flex-col gap-3 sm:flex-row">
        {state.needsConfirm ? <ConfirmSaveButton /> : null}
        <SubmitButton>{t('expenses.save')}</SubmitButton>
      </div>
    </form>
  );
}

const inputClass =
  'block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-foreground';

function MiniField({
  name,
  label,
  state,
  type = 'text',
  inputMode,
  defaultValue,
}: {
  name: string;
  label: string;
  state: FormState;
  type?: string;
  inputMode?: 'decimal';
  defaultValue?: string;
}) {
  const { t } = useI18n();
  const uid = useId();
  const id = `${uid}-${name}`;
  const err = state.fieldErrors?.[name];
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-base font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        defaultValue={state.values?.[name] ?? defaultValue ?? ''}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
        className={inputClass}
      />
      {err ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-bad-ink">
          {t('errors.' + err)}
        </p>
      ) : null}
    </div>
  );
}

/** Small per-trip form; uses generated ids so several can share one page. */
export function RevenueForm({ tripId, today }: { tripId: string; today: string }) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(createRevenue);
  return (
    <details className="rounded-xl border border-line bg-surface p-3">
      <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-brand-ink">
        {t('expenses.addRevenue')}
      </summary>
      <form action={formAction} noValidate className="mt-3">
        <input type="hidden" name="trip_id" value={tripId} />
        <FormMessage state={state} />
        <MiniField name="amount" label={t('expenses.revenueAmount')} state={state} inputMode="decimal" />
        <MiniField name="revenue_date" label={t('expenses.revenueDate')} state={state} type="date" defaultValue={today} />
        <MiniField name="description" label={t('expenses.description')} state={state} />
        <div className="flex flex-col gap-3 sm:flex-row">
          {state.needsConfirm ? <ConfirmSaveButton /> : null}
          <SubmitButton>{t('expenses.saveRevenue')}</SubmitButton>
        </div>
      </form>
    </details>
  );
}
