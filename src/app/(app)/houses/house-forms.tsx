'use client';

import { useId } from 'react';
import {
  FormMessage, NumberField, SelectField, SubmitButton, TextAreaField, TextField, useFormAction,
} from '@/components/forms-core';
import type { FormState } from '@/lib/action-helpers';
import { ETH_MONTHS, isoToEth } from '@/lib/ethiopian-date';
import { useI18n } from '@/lib/i18n-client';
import { HOUSE_PAYMENT_KINDS, HOUSE_PLANS, HOUSE_STATUSES, type HousePaymentKind, type HousePlan } from '@/lib/house-rules';
import { recordHousePayment, saveHouse } from './actions';

/** Values as the edit form shows them (amounts as plain decimal strings). */
export type HouseFormValues = {
  id: string;
  name: string;
  kind: string;
  location: string;
  house_no: string;
  ownership: string;
  price: string;
  price_confirmed: boolean;
  plan: HousePlan;
  rounds_total: string;
  round_amount: string;
  payments_complete: boolean;
  property_status: string;
  hold_reason: string;
  next_due_on: string;
  next_amount: string;
  finishing_pending: boolean;
  finishing_amount: string;
  checks: string;
  notes: string;
  refs: string;
};

function CheckField({
  name, label, state, defaultChecked,
}: {
  name: string;
  label: string;
  state: FormState;
  defaultChecked: boolean;
}) {
  const id = useId();
  // After a failed submit, show what was sent (an unchecked box is simply absent from the form data).
  const checked = state.values ? state.values[name] === 'on' : defaultChecked;
  return (
    <div className="mb-4 flex min-h-12 items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={checked}
        key={String(checked)}
        className="mt-1 size-6 shrink-0 accent-brand"
      />
      <label htmlFor={id} className="text-base">{label}</label>
    </div>
  );
}

const selectClass =
  'block min-h-12 w-full rounded-xl border border-input-border bg-surface px-2 py-2 text-base text-foreground';

/** Day / month / year selects in the Ethiopian calendar, sent as `<name>__d|m|y` (see ethDateFromForm). */
function EthDateField({
  name, label, state, defaultValue, hint, today,
}: {
  name: string;
  label: string;
  state: FormState;
  defaultValue?: string;
  hint?: string;
  today: string;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const errKey = state.fieldErrors?.[name];
  const def = defaultValue ? isoToEth(defaultValue) : null;
  const pick = (k: 'd' | 'm' | 'y', fallback: number | undefined) =>
    state.values ? (state.values[`${name}__${k}`] ?? '') : fallback == null ? '' : String(fallback);
  const thisYear = isoToEth(today).year;
  const years = Array.from({ length: 23 }, (_, i) => thisYear - 12 + i);
  const describedBy = [hint ? `${id}-hint` : '', errKey ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const common = { 'aria-invalid': errKey ? true : undefined, 'aria-describedby': describedBy, className: selectClass };
  return (
    <fieldset className="mb-4">
      <legend className="mb-1 block text-base font-medium">{label}</legend>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select {...common} name={`${name}__d`} aria-label={t('houses.date.day')} defaultValue={pick('d', def?.day)} key={`d${pick('d', def?.day)}`}>
          <option value="">{t('houses.date.day')}</option>
          {Array.from({ length: 30 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <select {...common} name={`${name}__m`} aria-label={t('houses.date.month')} defaultValue={pick('m', def?.month)} key={`m${pick('m', def?.month)}`}>
          <option value="">{t('houses.date.month')}</option>
          {ETH_MONTHS[locale].map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select {...common} name={`${name}__y`} aria-label={t('houses.date.year')} defaultValue={pick('y', def?.year)} key={`y${pick('y', def?.year)}`}>
          <option value="">{t('houses.date.year')}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {hint ? <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p> : null}
      {errKey ? (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-bad-ink">
          {t(errKey.includes('.') ? errKey : `errors.${errKey}`)}
        </p>
      ) : null}
    </fieldset>
  );
}

export function HouseForm({ house, today }: { house?: HouseFormValues; today: string }) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(saveHouse);
  const h = house;
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      {h ? <input type="hidden" name="id" value={h.id} /> : null}
      <TextField name="name" label={t('houses.field.name')} state={state} required maxLength={120} defaultValue={h?.name} />
      <TextField name="kind" label={t('houses.field.kind')} state={state} maxLength={120} defaultValue={h?.kind} />
      <TextField name="location" label={t('houses.field.location')} state={state} maxLength={160} defaultValue={h?.location} />
      <TextField name="house_no" label={t('houses.field.houseNo')} state={state} maxLength={60} defaultValue={h?.house_no} />
      <TextField
        name="ownership"
        label={t('houses.field.ownership')}
        hint={t('houses.field.ownershipHint')}
        state={state}
        maxLength={160}
        defaultValue={h?.ownership}
      />
      <NumberField name="price" label={t('houses.field.price')} hint={t('houses.field.unknownHint')} state={state} defaultValue={h?.price} />
      <CheckField name="price_confirmed" label={t('houses.field.priceConfirmed')} state={state} defaultChecked={h?.price_confirmed ?? true} />
      <SelectField
        name="plan"
        label={t('houses.field.plan')}
        state={state}
        required
        defaultValue={h?.plan ?? 'rounds'}
        options={HOUSE_PLANS.map((p) => ({ value: p, label: t(`houses.plan.${p}`) }))}
      />
      <NumberField name="rounds_total" label={t('houses.field.roundsTotal')} state={state} inputMode="numeric" defaultValue={h?.rounds_total} />
      <NumberField name="round_amount" label={t('houses.field.roundAmount')} state={state} defaultValue={h?.round_amount} />
      <CheckField
        name="payments_complete"
        label={t('houses.field.paymentsComplete')}
        state={state}
        defaultChecked={h?.payments_complete ?? true}
      />
      <SelectField
        name="property_status"
        label={t('houses.field.status')}
        state={state}
        required
        defaultValue={h?.property_status ?? 'none'}
        options={HOUSE_STATUSES.map((s) => ({ value: s, label: t(`houses.status.${s}`) }))}
      />
      <TextField name="hold_reason" label={t('houses.field.holdReason')} state={state} maxLength={500} defaultValue={h?.hold_reason} />
      <EthDateField
        name="next_due_on"
        label={t('houses.field.nextDueOn')}
        hint={t('houses.date.hint')}
        state={state}
        defaultValue={h?.next_due_on || undefined}
        today={today}
      />
      <NumberField name="next_amount" label={t('houses.field.nextAmount')} state={state} defaultValue={h?.next_amount} />
      <CheckField
        name="finishing_pending"
        label={t('houses.field.finishingPending')}
        state={state}
        defaultChecked={h?.finishing_pending ?? false}
      />
      <NumberField name="finishing_amount" label={t('houses.field.finishingAmount')} state={state} defaultValue={h?.finishing_amount} />
      <TextAreaField
        name="checks"
        label={t('houses.field.checks')}
        hint={t('houses.field.checksHint')}
        state={state}
        maxLength={4000}
        defaultValue={h?.checks}
      />
      <TextAreaField name="notes" label={t('houses.field.notes')} state={state} maxLength={4000} defaultValue={h?.notes} />
      <TextAreaField name="refs" label={t('houses.field.refs')} state={state} maxLength={2000} defaultValue={h?.refs} />
      <SubmitButton>{t('houses.save')}</SubmitButton>
    </form>
  );
}

export function PaymentForm({
  propertyId, today, defaultKind, defaultAmount,
}: {
  propertyId: string;
  today: string;
  defaultKind: HousePaymentKind;
  defaultAmount?: string;
}) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(recordHousePayment);
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="property_id" value={propertyId} />
      <NumberField name="amount" label={t('houses.pay.amount')} state={state} required defaultValue={defaultAmount} />
      <SelectField
        name="kind"
        label={t('houses.pay.kind')}
        state={state}
        required
        defaultValue={defaultKind}
        options={HOUSE_PAYMENT_KINDS.map((k) => ({ value: k, label: t(`houses.payKind.${k}`) }))}
      />
      <EthDateField
        name="paid_on"
        label={t('houses.pay.paidOn')}
        hint={`${t('houses.date.hint')} · ${t('houses.pay.paidOnHint')}`}
        state={state}
        today={today}
      />
      <CheckField name="confirmed" label={t('houses.pay.confirmed')} state={state} defaultChecked />
      <TextField name="note" label={t('houses.pay.note')} state={state} maxLength={300} />
      <p className="mb-4 text-sm text-muted">{t('houses.pay.hint')}</p>
      <SubmitButton>{t('houses.recordPayment')}</SubmitButton>
    </form>
  );
}
