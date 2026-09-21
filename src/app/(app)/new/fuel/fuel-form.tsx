'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-client';
import {
  ConfirmSaveButton,
  DateField,
  FormMessage,
  NumberField,
  SelectField,
  SubmitButton,
  TextAreaField,
  useFormAction,
} from '@/components/forms-core';
import { formatEtb } from '@/lib/format';
import { calcTotalCents, centsToDecimal } from '@/lib/trip-rules';
import { createFuel } from './actions';

export function FuelForm({
  vehicles,
  defaultVehicle,
  today,
}: {
  vehicles: { value: string; label: string }[];
  defaultVehicle?: string;
  today: string;
}) {
  const { t, label, locale } = useI18n();
  const { state, formAction } = useFormAction(createFuel);
  const [qty, setQty] = useState(state.values?.quantity ?? '');
  const [price, setPrice] = useState(state.values?.unit_price ?? '');
  const [total, setTotal] = useState(state.values?.total_amount ?? '');

  const formRef = useRef<HTMLFormElement>(null);
  const calc = calcTotalCents(qty, price);
  const showCalc = calc != null && total.trim() === '';

  function useCalculated() {
    if (calc == null) return;
    const v = centsToDecimal(calc);
    const el = formRef.current?.elements.namedItem('total_amount');
    if (el instanceof HTMLInputElement) el.value = v;
    setTotal(v);
  }

  return (
    <form ref={formRef} action={formAction} noValidate>
      <FormMessage state={state} />
      <SelectField
        name="vehicle_id"
        label={t('fuel.vehicle')}
        state={state}
        required
        defaultValue={defaultVehicle}
        placeholder={t('fuel.choose')}
        options={vehicles}
      />
      <DateField name="fuel_date" label={t('fuel.date')} state={state} required defaultValue={today} />
      <SelectField
        name="fuel_type"
        label={t('fuel.fuelType')}
        state={state}
        required
        defaultValue="DIESEL"
        options={['DIESEL', 'PETROL'].map((f) => ({ value: f, label: label('fuelType', f) }))}
      />
      <NumberField
        name="quantity"
        label={t('fuel.quantity')}
        state={state}
        required
        onChange={(e) => setQty(e.target.value)}
      />
      <NumberField
        name="unit_price"
        label={t('fuel.unitPrice')}
        state={state}
        required
        onChange={(e) => setPrice(e.target.value)}
      />
      <NumberField
        name="total_amount"
        label={t('fuel.total')}
        state={state}
        required
        hint={t('fuel.totalHint')}
        onChange={(e) => setTotal(e.target.value)}
      />
      {showCalc ? (
        <button
          type="button"
          onClick={useCalculated}
          className="-mt-2 mb-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-base font-semibold hover:bg-muted-soft"
        >
          {t('fuel.calcTotal', { amount: formatEtb(calc, locale) })}
        </button>
      ) : null}
      <NumberField name="odometer" label={t('fuel.odometer')} state={state} />
      <TextAreaField name="notes" label={t('fuel.notes')} state={state} maxLength={500} />
      <div className="flex flex-col gap-3 sm:flex-row">
        {state.needsConfirm ? <ConfirmSaveButton /> : null}
        <SubmitButton>{t('fuel.save')}</SubmitButton>
      </div>
    </form>
  );
}
