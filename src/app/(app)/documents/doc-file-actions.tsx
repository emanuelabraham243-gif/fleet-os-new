'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { documentFileUrl, type DocTable } from './actions';

export type DocFileKind = 'image' | 'pdf' | 'other';

/** File kind from the stored path's extension (set server-side from the sniffed type). */
export function fileKindOf(path: string): DocFileKind {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

/** Filesystem-safe base name; keeps letters in any script (Amharic titles stay readable). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'document';
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function clickDownload(href: string, filename?: string) {
  const a = document.createElement('a');
  a.href = href;
  if (filename) a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function signed(table: DocTable, id: string, download?: string): Promise<string> {
  const res = await documentFileUrl(table, id, 'file', download);
  if ('error' in res) throw new Error(res.error);
  return res.url;
}

/** Wraps an image into a single-page A4 PDF (portrait or landscape to match), fitted with a margin. */
export async function imageToPdf(blob: Blob): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  // jsPDF embeds JPEG bytes as-is (no quality loss); other formats go through a canvas first.
  let jpeg: Uint8Array;
  if (blob.type === 'image/jpeg') {
    jpeg = new Uint8Array(await blob.arrayBuffer());
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    const b = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((x) => (x ? res(x) : rej(new Error('encode failed'))), 'image/jpeg', 0.92),
    );
    jpeg = new Uint8Array(await b.arrayBuffer());
  }
  bitmap.close();

  const landscape = width > height;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const scale = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
  const w = width * scale;
  const h = height * scale;
  doc.addImage(jpeg, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  return doc.output('blob');
}

export function DocFileActions({
  table,
  id,
  path,
  name,
}: {
  table: DocTable;
  id: string;
  path: string;
  name: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<null | 'image' | 'pdf' | 'file'>(null);
  const [failed, setFailed] = useState(false);
  const kind = fileKindOf(path);
  const base = safeFileName(name);
  const ext = path.split('.').pop()?.toLowerCase() ?? 'bin';

  const run = async (which: 'image' | 'pdf' | 'file', job: () => Promise<void>) => {
    setBusy(which);
    setFailed(false);
    try {
      await job();
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  // Image: straight download (lands in the phone's gallery/Downloads). On iPhone a download
  // goes to Files, so offer the share sheet there, whose "Save Image" puts it in Photos.
  const saveImage = () =>
    run('image', async () => {
      const filename = `${base}.${ext}`;
      if (isIos() && typeof navigator.canShare === 'function') {
        const blob = await (await fetch(await signed(table, id))).blob();
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch (e) {
            if ((e as Error).name === 'AbortError') return; // user closed the share sheet
          }
        }
        const href = URL.createObjectURL(blob);
        clickDownload(href, filename);
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
        return;
      }
      clickDownload(await signed(table, id, filename));
    });

  const savePdf = () =>
    run('pdf', async () => {
      if (kind === 'pdf') {
        clickDownload(await signed(table, id, `${base}.pdf`));
        return;
      }
      const res = await fetch(await signed(table, id));
      if (!res.ok) throw new Error('fetch failed');
      const pdf = await imageToPdf(await res.blob());
      const href = URL.createObjectURL(pdf);
      clickDownload(href, `${base}.pdf`);
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    });

  const saveFile = () => run('file', async () => clickDownload(await signed(table, id, `${base}.${ext}`)));

  const btn =
    'inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-4 py-2 text-base font-semibold hover:bg-muted-soft disabled:opacity-60';

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {kind === 'image' ? (
          <button type="button" className={btn} onClick={saveImage} disabled={busy !== null}>
            {busy === 'image' ? t('docFile.working') : t('docFile.saveImage')}
          </button>
        ) : null}
        {kind === 'image' || kind === 'pdf' ? (
          <button type="button" className={btn} onClick={savePdf} disabled={busy !== null}>
            {busy === 'pdf' ? t('docFile.working') : t('docFile.savePdf')}
          </button>
        ) : (
          <button type="button" className={btn} onClick={saveFile} disabled={busy !== null}>
            {busy === 'file' ? t('docFile.working') : t('docFile.download')}
          </button>
        )}
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-base font-medium text-bad-ink">{t('docFile.failed')}</p>
      ) : null}
    </div>
  );
}
