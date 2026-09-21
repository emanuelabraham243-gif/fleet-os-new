'use client';

import {
  DateField, FileField, FormMessage, SelectField, SubmitButton, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { DRIVER_DOC_TYPES, VEHICLE_DOC_TYPES } from '@/lib/maintenance-rules';
import { createDocument } from './actions';

export function DocumentForm({
  kind,
  owners,
  today,
}: {
  kind: 'vehicle' | 'driver';
  owners: { id: string; label: string }[];
  today: string;
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createDocument);
  const types = kind === 'vehicle' ? VEHICLE_DOC_TYPES : DRIVER_DOC_TYPES;

  // Keys with a dot are feature-namespace messages; FormMessage only knows the `errors` namespace.
  const featureError = state.error?.includes('.') ? state.error : undefined;
  const coreState = featureError ? { ...state, error: undefined } : state;

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="kind" value={kind} />
      <FormMessage state={coreState} />
      {featureError ? (
        <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {t(featureError)}
        </p>
      ) : null}
      <SelectField
        name="owner_id"
        label={kind === 'vehicle' ? t('documents.ownerVehicle') : t('documents.ownerDriver')}
        state={state}
        required
        placeholder={t('documents.chooseOwner')}
        options={owners.map((o) => ({ value: o.id, label: o.label }))}
      />
      <SelectField
        name="document_type"
        label={t('documents.type')}
        state={state}
        required
        placeholder={t('documents.chooseType')}
        options={types.map((c) => ({ value: c, label: label('documentType', c) }))}
      />
      <TextField name="number" label={t('documents.formNumber')} state={state} maxLength={60} />
      <DateField name="issued_on" label={t('documents.formIssued')} state={state} max={today} />
      <DateField
        name="expires_on"
        label={t('documents.formExpires')}
        state={state}
        hint={t('documents.formExpiresHint')}
      />
      <FileField
        name="file"
        label={t('documents.formFile')}
        state={state}
        hint={t('documents.formFileHint')}
        accept="image/jpeg,image/png,image/webp,application/pdf"
      />
      <SubmitButton>{t('documents.save')}</SubmitButton>
    </form>
  );
}
