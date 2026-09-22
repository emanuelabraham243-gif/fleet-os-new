'use client';

import {
  FormMessage, NumberField, SelectField, SubmitButton, TextAreaField, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { createVehicle, updateVehicle } from './actions';

const EDITABLE_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const;

export function VehicleForm({
  vehicle,
}: {
  vehicle?: {
    id: string;
    name: string;
    plate_number: string;
    make: string | null;
    model: string | null;
    year: number | null;
    current_odometer: number | string | null;
    notes: string | null;
    status: string;
    onTrip: boolean;
  };
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(vehicle ? updateVehicle : createVehicle);

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      {vehicle ? <input type="hidden" name="id" value={vehicle.id} /> : null}
      <TextField
        name="name"
        label={t('vehicles.form.name')}
        state={state}
        required
        defaultValue={vehicle?.name}
        maxLength={120}
      />
      <TextField
        name="plate_number"
        label={t('common.plate')}
        state={state}
        required
        defaultValue={vehicle?.plate_number}
        maxLength={30}
      />
      <TextField
        name="make"
        label={t('vehicles.form.make')}
        state={state}
        defaultValue={vehicle?.make}
        maxLength={60}
      />
      <TextField
        name="model"
        label={t('vehicles.form.model')}
        state={state}
        defaultValue={vehicle?.model}
        maxLength={60}
      />
      <NumberField
        name="year"
        label={t('vehicles.form.year')}
        state={state}
        defaultValue={vehicle?.year}
        inputMode="numeric"
      />
      <NumberField
        name="current_odometer"
        label={t('vehicles.odometer')}
        state={state}
        defaultValue={vehicle?.current_odometer}
        hint={t('vehicles.form.odometerHint')}
      />
      {vehicle && !vehicle.onTrip ? (
        <SelectField
          name="status"
          label={t('common.status')}
          state={state}
          required
          defaultValue={vehicle.status}
          options={EDITABLE_STATUSES.map((s) => ({ value: s, label: label('vehicleStatus', s) }))}
        />
      ) : null}
      {vehicle?.onTrip ? <p className="mb-4 text-base text-muted">{t('vehicles.form.onTripNote')}</p> : null}
      <TextAreaField name="notes" label={t('common.notes')} state={state} defaultValue={vehicle?.notes} maxLength={500} />
      <SubmitButton>{t('common.save')}</SubmitButton>
    </form>
  );
}
