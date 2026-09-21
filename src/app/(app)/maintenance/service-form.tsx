'use client';

import {
  ConfirmSaveButton, DateField, FormMessage, NumberField, SelectField, SubmitButton,
  TextAreaField, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { SERVICE_CATEGORIES } from '@/lib/maintenance-rules';
import { createServiceRecord } from './actions';

export function ServiceForm({
  vehicles,
  today,
  defaultVehicle,
}: {
  vehicles: { id: string; label: string }[];
  today: string;
  defaultVehicle?: string;
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createServiceRecord);

  return (
    <form action={formAction} noValidate>
      <FormMessage state={state} />
      {state.needsConfirm ? (
        <p role="alert" className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-base font-medium text-warn-ink">
          {t('errors.odometerJump')}
        </p>
      ) : null}
      <SelectField
        name="vehicle_id"
        label={t('maintenance.formVehicle')}
        state={state}
        required
        placeholder={t('maintenance.chooseVehicle')}
        defaultValue={defaultVehicle}
        options={vehicles.map((v) => ({ value: v.id, label: v.label }))}
      />
      <SelectField
        name="category"
        label={t('maintenance.formCategory')}
        state={state}
        required
        placeholder={t('maintenance.chooseCategory')}
        options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: label('serviceCategory', c) }))}
      />
      <DateField
        name="service_date"
        label={t('maintenance.formDate')}
        state={state}
        required
        defaultValue={today}
        max={today}
      />
      <NumberField
        name="odometer"
        label={t('maintenance.formOdometer')}
        state={state}
        hint={t('maintenance.formOdometerHint')}
      />
      <NumberField
        name="cost"
        label={t('maintenance.formCost')}
        state={state}
        hint={t('maintenance.formCostHint')}
      />
      <TextField name="service_provider" label={t('maintenance.formProvider')} state={state} maxLength={120} />
      <TextAreaField name="description" label={t('maintenance.formDescription')} state={state} maxLength={500} />
      <p className="mb-4 text-sm text-muted">{t('maintenance.formNote')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {state.needsConfirm ? <ConfirmSaveButton /> : <SubmitButton>{t('maintenance.formSave')}</SubmitButton>}
      </div>
    </form>
  );
}
