'use client';

import {
  DateField, FormMessage, SelectField, SubmitButton, TextAreaField, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { createDriver, updateDriver } from './actions';

const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export function DriverForm({
  driver,
}: {
  driver?: {
    id: string;
    name: string;
    phone: string | null;
    license_number: string | null;
    license_expiry: string | null;
    status: string;
    notes: string | null;
  };
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(driver ? updateDriver : createDriver);

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      {driver ? <input type="hidden" name="id" value={driver.id} /> : null}
      <TextField
        name="name"
        label={t('drivers.form.name')}
        state={state}
        required
        defaultValue={driver?.name}
        maxLength={120}
      />
      <TextField
        name="phone"
        label={t('drivers.form.phone')}
        state={state}
        type="tel"
        defaultValue={driver?.phone}
        maxLength={20}
      />
      <TextField
        name="license_number"
        label={t('drivers.form.licenseNumber')}
        state={state}
        defaultValue={driver?.license_number}
        maxLength={40}
      />
      <DateField
        name="license_expiry"
        label={t('drivers.form.licenseExpiry')}
        state={state}
        defaultValue={driver?.license_expiry}
      />
      {driver ? (
        <SelectField
          name="status"
          label={t('common.status')}
          state={state}
          required
          defaultValue={driver.status}
          options={STATUSES.map((s) => ({ value: s, label: label('driverStatus', s) }))}
        />
      ) : null}
      <TextAreaField name="notes" label={t('common.notes')} state={state} defaultValue={driver?.notes} maxLength={500} />
      <SubmitButton>{t('common.save')}</SubmitButton>
    </form>
  );
}
