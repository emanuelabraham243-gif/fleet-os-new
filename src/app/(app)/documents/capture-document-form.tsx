'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DateField, FormMessage, SelectField, SubmitButton, TextField, useFormAction,
} from '@/components/forms-core';
import { useI18n } from '@/lib/i18n-client';
import { DRIVER_DOC_TYPES, GENERAL_DOC_CATEGORIES, VEHICLE_DOC_TYPES } from '@/lib/maintenance-rules';
import { loadOpenCv, scanDocument } from '@/lib/doc-scan';
import { captureDocument } from './actions';

/** The untouched photo is kept at up to this size (re-encoded so uploads stay small). */
const ORIGINAL_MAX_SIDE = 3000;
/** Scan + original must stay under the hosting platform's request-size limit (~6 MB). */
const MAX_TOTAL_BYTES = 5.5 * 1024 * 1024;

type Phase = 'idle' | 'preparing' | 'processing' | 'ready' | 'failed';
type Captured = { scan: File; original: File; scanUrl: string; originalUrl: string; detected: boolean };

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality),
  );

/** Lets React paint the status message before the (synchronous) OpenCV work starts. */
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function processPhoto(file: File, onPreparing: () => void): Promise<Omit<Captured, 'scanUrl' | 'originalUrl'>> {
  // createImageBitmap applies the photo's EXIF rotation, so portrait shots stay upright.
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, ORIGINAL_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const src = document.createElement('canvas');
  src.width = Math.round(bitmap.width * s);
  src.height = Math.round(bitmap.height * s);
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('no canvas');
  sctx.drawImage(bitmap, 0, 0, src.width, src.height);
  bitmap.close();

  let cvReady = false;
  const cvPromise = loadOpenCv().then((cv) => {
    cvReady = true;
    return cv;
  });
  await nextPaint();
  if (!cvReady) onPreparing();
  const cv = await cvPromise;
  await nextPaint();

  const result = scanDocument(cv, sctx.getImageData(0, 0, src.width, src.height));
  const out = document.createElement('canvas');
  out.width = result.width;
  out.height = result.height;
  out.getContext('2d')!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);

  const scanBlob = await toJpeg(out, 0.9);
  let originalBlob = await toJpeg(src, 0.9);
  for (const q of [0.75, 0.6, 0.45]) {
    if (scanBlob.size + originalBlob.size <= MAX_TOTAL_BYTES) break;
    originalBlob = await toJpeg(src, q);
  }

  return {
    scan: new File([scanBlob], 'scan.jpg', { type: 'image/jpeg' }),
    original: new File([originalBlob], 'original.jpg', { type: 'image/jpeg' }),
    detected: result.corners !== null,
  };
}

export function CaptureDocumentForm({
  kind,
  owners = [],
  today,
}: {
  kind: 'vehicle' | 'driver' | 'general';
  owners?: { id: string; label: string }[];
  today: string;
}) {
  const { t, label } = useI18n();
  const { state, formAction } = useFormAction(captureDocument);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [missingPhoto, setMissingPhoto] = useState(false);

  // Release preview object URLs when replaced or unmounted.
  useEffect(() => {
    if (!captured) return;
    return () => {
      URL.revokeObjectURL(captured.scanUrl);
      URL.revokeObjectURL(captured.originalUrl);
    };
  }, [captured]);

  const openCamera = () => {
    void loadOpenCv().catch(() => {}); // start downloading the scanner while the camera is open
    cameraRef.current?.click();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same photo again after "Take again"
    if (!file) return;
    setMissingPhoto(false);
    setPhase('processing');
    try {
      const r = await processPhoto(file, () => setPhase('preparing'));
      setCaptured({ ...r, scanUrl: URL.createObjectURL(r.scan), originalUrl: URL.createObjectURL(r.original) });
      setPhase('ready');
    } catch {
      setCaptured(null);
      setPhase('failed');
    }
  };

  // The images live in React state (not file inputs) so a validation error never loses the photo.
  const submit = (fd: FormData) => {
    if (!captured) {
      setMissingPhoto(true);
      return;
    }
    fd.set('scan', captured.scan);
    fd.set('original', captured.original);
    return formAction(fd);
  };

  const featureError = state.error?.includes('.') ? state.error : undefined;
  const coreState = featureError ? { ...state, error: undefined } : state;
  const busy = phase === 'preparing' || phase === 'processing';

  return (
    <form action={submit} noValidate>
      <input type="hidden" name="kind" value={kind} />
      <FormMessage state={coreState} />
      {featureError || missingPhoto ? (
        <p role="alert" className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {t(missingPhoto ? 'capture.noPhoto' : featureError!)}
        </p>
      ) : null}

      <p className="mb-3 text-base text-muted">{t('capture.intro')}</p>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPhoto}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={openCamera}
        disabled={busy}
        className="mb-3 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-brand px-5 text-lg font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {captured ? t('capture.retake') : t('capture.takePhoto')}
      </button>

      <div aria-live="polite">
        {phase === 'preparing' ? <p className="mb-3 text-base">{t('capture.preparing')}</p> : null}
        {phase === 'processing' ? <p className="mb-3 text-base">{t('capture.processing')}</p> : null}
        {phase === 'failed' ? (
          <p className="mb-3 rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">{t('capture.failed')}</p>
        ) : null}
        {phase === 'ready' && captured ? (
          <p className={`mb-3 text-base ${captured.detected ? '' : 'text-warn-ink'}`}>
            {captured.detected ? t('capture.detected') : t('capture.notDetected')}
          </p>
        ) : null}
      </div>

      {captured ? (
        <div className="mb-4 grid grid-cols-[2fr_1fr] items-start gap-3">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={captured.scanUrl} alt={t('capture.cleanedLabel')} className="w-full rounded-xl border border-line" />
            <figcaption className="mt-1 text-sm text-muted">{t('capture.cleanedLabel')}</figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={captured.originalUrl} alt={t('capture.originalLabel')} className="w-full rounded-xl border border-line" />
            <figcaption className="mt-1 text-sm text-muted">{t('capture.originalLabel')}</figcaption>
          </figure>
        </div>
      ) : null}

      {kind === 'general' ? (
        <SelectField
          name="category"
          label={t('documents.generalCategory')}
          state={state}
          required
          placeholder={t('documents.generalChooseCategory')}
          options={GENERAL_DOC_CATEGORIES.map((c) => ({ value: c, label: label('generalDocCategory', c) }))}
        />
      ) : (
        <>
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
            options={(kind === 'vehicle' ? VEHICLE_DOC_TYPES : DRIVER_DOC_TYPES).map((c) => ({
              value: c,
              label: label('documentType', c),
            }))}
          />
        </>
      )}
      <TextField
        name="title"
        label={t('capture.name')}
        state={state}
        required
        maxLength={120}
        hint={t('capture.nameHint')}
      />
      <TextField name="number" label={t('documents.formNumber')} state={state} maxLength={60} />
      <DateField name="issued_on" label={t('documents.formIssued')} state={state} max={today} />
      <DateField
        name="expires_on"
        label={t('documents.formExpires')}
        state={state}
        hint={t('documents.formExpiresHint')}
      />
      <SubmitButton>{t('capture.save')}</SubmitButton>
    </form>
  );
}
