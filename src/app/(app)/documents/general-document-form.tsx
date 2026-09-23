'use client';

import {
  DateField, FileField, FormMessage, SelectField, SubmitButton, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { GENERAL_DOC_CATEGORIES } from '@/lib/maintenance-rules';
import { createGeneralDocument } from './actions';

export function GeneralDocumentForm({ today }: { today: string }) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(createGeneralDocument);

  const featureError = state.error?.includes('.') ? state.error : undefined;
  const coreState = featureError ? { ...state, error: undefined } : state;

  return (
    <form action={formAction} noValidate>
      <FormMessage state={coreState} />
      {featureError ? (
        <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {t(featureError)}
        </p>
      ) : null}
      <SelectField
        name="category"
        label={t('documents.generalCategory')}
        state={state}
        required
        placeholder={t('documents.generalChooseCategory')}
        options={GENERAL_DOC_CATEGORIES.map((c) => ({ value: c, label: label('generalDocCategory', c) }))}
      />
      <TextField
        name="title"
        label={t('documents.generalTitle')}
        state={state}
        required
        maxLength={120}
        hint={t('documents.generalTitleHint')}
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
        accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />
      <SubmitButton>{t('documents.save')}</SubmitButton>
    </form>
  );
}
