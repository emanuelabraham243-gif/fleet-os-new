'use client';

import { FileField, FormMessage, SubmitButton, useFormAction } from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { attachDocumentFile, type DocTable } from './actions';

/** Shown on a document that has no file yet: pick a photo/PDF and attach it to the record. */
export function AttachFileForm({ table, id, returnTo }: { table: DocTable; id: string; returnTo: string }) {
  const { t } = useI18n();
  const { state, formAction } = useFormAction(attachDocumentFile);
  const featureError = state.error?.includes('.') ? state.error : undefined;
  const coreState = featureError ? { ...state, error: undefined } : state;
  return (
    <details className="rounded-xl border border-line bg-surface p-3" open={Boolean(state.error || state.fieldErrors)}>
      <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">
        {t('documents.attachFile')}
      </summary>
      <form action={formAction} noValidate className="mt-3">
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <FormMessage state={coreState} />
        {featureError ? (
          <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
            {t(featureError)}
          </p>
        ) : null}
        <FileField
          name="file"
          label={t('documents.formFile')}
          hint={t('documents.formFileHint')}
          state={state}
          required
          accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
        <SubmitButton>{t('documents.attachSave')}</SubmitButton>
      </form>
    </details>
  );
}
