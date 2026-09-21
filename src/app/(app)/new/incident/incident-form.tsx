'use client';

import { useI18n } from '@/lib/i18n-client';
import {
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useFormAction,
} from '@/components/forms-core';
import { createIncident } from './actions';

export function IncidentForm({
  vehicleId,
  drivers,
  trips,
  nowLocal,
}: {
  vehicleId: string;
  drivers: { value: string; label: string }[];
  trips: { value: string; label: string }[];
  nowLocal: string;
}) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(createIncident);
  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <FormMessage state={state} />
      <SelectField
        name="driver_id"
        label={t('incidents.driver')}
        state={state}
        placeholder={t('incidents.noDriver')}
        options={drivers}
      />
      <SelectField
        name="trip_id"
        label={t('incidents.trip')}
        state={state}
        placeholder={t('incidents.noTrip')}
        options={trips}
      />
      <div className="mb-4">
        <label htmlFor="f-occurred_at" className="mb-1 block text-base font-medium">
          {t('incidents.occurredAt')}
          <span aria-hidden="true"> *</span>
        </label>
        <input
          id="f-occurred_at"
          name="occurred_at"
          type="datetime-local"
          required
          defaultValue={state.values?.occurred_at ?? nowLocal}
          aria-invalid={state.fieldErrors?.occurred_at ? true : undefined}
          aria-describedby={state.fieldErrors?.occurred_at ? 'f-occurred_at-err' : undefined}
          className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-foreground"
        />
        {state.fieldErrors?.occurred_at ? (
          <p id="f-occurred_at-err" role="alert" className="mt-1 text-sm font-medium text-bad-ink">
            {t('errors.' + state.fieldErrors.occurred_at)}
          </p>
        ) : null}
      </div>
      <TextField name="title" label={t('incidents.titleLabel')} state={state} required maxLength={120} />
      <TextAreaField
        name="description"
        label={t('incidents.description')}
        state={state}
        hint={t('incidents.descriptionHint')}
        maxLength={2000}
      />
      <SubmitButton>{t('incidents.save')}</SubmitButton>
    </form>
  );
}
