'use client';

import { useI18n } from '@/lib/i18n-client';
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
import { createTrip } from './actions';

export function TripForm({
  vehicles,
  drivers,
  today,
}: {
  vehicles: { value: string; label: string }[];
  drivers: { value: string; label: string }[];
  today: string;
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createTrip);
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      <SelectField
        name="vehicle_id"
        label={t('trips.form.vehicle')}
        state={state}
        required
        placeholder={t('trips.form.choose')}
        options={vehicles}
      />
      <SelectField
        name="driver_id"
        label={t('trips.form.driver')}
        state={state}
        required
        placeholder={t('trips.form.choose')}
        options={drivers}
      />
      <DateField name="trip_date" label={t('trips.form.date')} state={state} required defaultValue={today} />
      <TextField name="origin" label={t('trips.form.origin')} state={state} required maxLength={120} autoComplete="off" />
      <TextField
        name="destination"
        label={t('trips.form.destination')}
        state={state}
        required
        maxLength={120}
        autoComplete="off"
      />
      <SelectField
        name="status"
        label={t('trips.form.initialStatus')}
        state={state}
        required
        defaultValue="PLANNED"
        options={[
          { value: 'PLANNED', label: label('tripStatus', 'PLANNED') },
          { value: 'IN_PROGRESS', label: label('tripStatus', 'IN_PROGRESS') },
        ]}
      />
      <NumberField
        name="revenue"
        label={t('trips.form.revenue')}
        state={state}
        hint={t('trips.form.revenueHint')}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        {state.needsConfirm ? <ConfirmSaveButton /> : null}
        <SubmitButton>{t('trips.form.save')}</SubmitButton>
      </div>
    </form>
  );
}
