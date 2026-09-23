'use client';

import { useState } from 'react';
import {
  DateField, FormMessage, NumberField, SelectField, SubmitButton, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { SERVICE_CATEGORIES, hasInterval } from '@/lib/maintenance-rules';
import { createSchedule } from './actions';

export function ScheduleForm({ vehicles }: { vehicles: { id: string; label: string }[] }) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createSchedule);
  const [clientError, setClientError] = useState(false);

  // Keys with a dot are feature-namespace messages; FormMessage only knows the `errors` namespace.
  const featureError = state.error?.includes('.') ? state.error : undefined;
  const coreState = featureError ? { ...state, error: undefined } : state;
  const shownError = clientError ? 'maintenance.intervalRequired' : featureError;

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const ok = hasInterval(
          String(fd.get('interval_km') ?? ''),
          String(fd.get('interval_days') ?? ''),
          String(fd.get('interval_trips') ?? ''),
        );
        setClientError(!ok);
        if (!ok) e.preventDefault();
      }}
    >
      <FormMessage state={coreState} />
      {shownError ? (
        <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {t(shownError)}
        </p>
      ) : null}
      <SelectField
        name="vehicle_id"
        label={t('maintenance.scheduleVehicle')}
        state={state}
        required
        placeholder={t('maintenance.chooseVehicle')}
        options={vehicles.map((v) => ({ value: v.id, label: v.label }))}
      />
      <SelectField
        name="service_category"
        label={t('maintenance.scheduleCategory')}
        state={state}
        required
        placeholder={t('maintenance.chooseCategory')}
        options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: label('serviceCategory', c) }))}
      />
      <NumberField
        name="interval_km"
        label={t('maintenance.intervalKm')}
        state={state}
        hint={t('maintenance.intervalHint')}
      />
      <NumberField name="interval_days" label={t('maintenance.intervalDays')} state={state} inputMode="numeric" />
      <NumberField
        name="interval_trips"
        label={t('maintenance.intervalTrips')}
        state={state}
        inputMode="numeric"
        hint={t('maintenance.intervalTripsHint')}
      />
      <DateField
        name="next_due_date"
        label={t('maintenance.nextDueDate')}
        state={state}
        hint={t('maintenance.initialHint')}
      />
      <NumberField name="next_due_odometer" label={t('maintenance.nextDueOdometer')} state={state} />
      <SubmitButton>{t('maintenance.scheduleSave')}</SubmitButton>
    </form>
  );
}
