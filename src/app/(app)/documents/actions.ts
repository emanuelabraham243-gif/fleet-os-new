'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/auth';
import { daysBetween } from '@/lib/format';
import { formValues, mapDbError, type FormState } from '@/lib/action-helpers';
import { fieldErrorsFromZod, zChoice, zDate, zOptionalText, zUuid } from '@/lib/schemas';
import { MAX_UPLOAD_BYTES, MIME_EXT, sniffMime } from '@/lib/file-sniff';
import { DRIVER_DOC_TYPES, GENERAL_DOC_CATEGORIES, VEHICLE_DOC_TYPES } from '@/lib/maintenance-rules';

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const baseShape = {
  owner_id: zUuid(),
  number: zOptionalText(60),
  issued_on: z.preprocess(emptyToUndef, zDate().optional()),
  expires_on: z.preprocess(emptyToUndef, zDate({ allowFuture: true }).optional()),
};

const vehicleSchema = z.object({ ...baseShape, document_type: zChoice(VEHICLE_DOC_TYPES) });
const driverSchema = z.object({ ...baseShape, document_type: zChoice(DRIVER_DOC_TYPES) });

export async function createDocument(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const values = formValues(fd);
  const kind: 'vehicle' | 'driver' = values.kind === 'driver' ? 'driver' : 'vehicle';

  const parsed = (kind === 'vehicle' ? vehicleSchema : driverSchema).safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  const d = parsed.data;
  if (d.issued_on && d.expires_on && daysBetween(d.issued_on, d.expires_on) < 0) {
    return { fieldErrors: { expires_on: 'invalidDate' }, values };
  }

  const supabase = await createClient();

  // The owner must belong to the viewer's organization (RLS also enforces this).
  const { data: owner, error: ownerErr } = await supabase
    .from(kind === 'vehicle' ? 'vehicles' : 'drivers')
    .select('id')
    .eq('id', d.owner_id)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();
  if (ownerErr) return { error: mapDbError(ownerErr), values };
  if (!owner) return { fieldErrors: { owner_id: 'invalidChoice' }, values };

  // Optional attachment: real type from magic bytes; client-declared type and name are ignored.
  let filePath: string | null = null;
  const file = fd.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: 'documents.fileTooBig', values };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) return { error: 'documents.fileType', values };

    filePath = `${profile.organization_id}/${kind}/${d.owner_id}/${crypto.randomUUID()}.${MIME_EXT[mime]}`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(filePath, bytes, { contentType: mime, upsert: false });
    if (upErr) return { error: 'documents.uploadFailed', values };
  }

  const row = {
    organization_id: profile.organization_id,
    document_type: d.document_type,
    document_number: d.number ?? null,
    issued_on: d.issued_on ?? null,
    expires_on: d.expires_on ?? null,
    file_path: filePath,
  };
  const { error } =
    kind === 'vehicle'
      ? await supabase.from('vehicle_documents').insert({ ...row, vehicle_id: d.owner_id })
      : await supabase.from('driver_documents').insert({ ...row, driver_id: d.owner_id });

  if (error) {
    if (filePath) await supabase.storage.from('documents').remove([filePath]); // best effort
    return { error: mapDbError(error), values };
  }

  revalidatePath('/documents');
  redirect(`/documents?tab=${kind}&saved=1`);
}

const generalSchema = z.object({
  category: zChoice(GENERAL_DOC_CATEGORIES),
  title: zOptionalText(120),
  number: zOptionalText(60),
  issued_on: z.preprocess(emptyToUndef, zDate().optional()),
  expires_on: z.preprocess(emptyToUndef, zDate({ allowFuture: true }).optional()),
});

export async function createGeneralDocument(_prev: FormState, fd: FormData): Promise<FormState> {
  const { profile } = await requireViewer();
  const values = formValues(fd);

  const parsed = generalSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error), values };
  }
  const d = parsed.data;
  if (!d.title) return { fieldErrors: { title: 'required' }, values };
  if (d.issued_on && d.expires_on && daysBetween(d.issued_on, d.expires_on) < 0) {
    return { fieldErrors: { expires_on: 'invalidDate' }, values };
  }

  const supabase = await createClient();

  let filePath: string | null = null;
  const file = fd.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: 'documents.fileTooBig', values };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) return { error: 'documents.fileType', values };

    filePath = `${profile.organization_id}/general/${d.category}/${crypto.randomUUID()}.${MIME_EXT[mime]}`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(filePath, bytes, { contentType: mime, upsert: false });
    if (upErr) return { error: 'documents.uploadFailed', values };
  }

  const { error } = await supabase.from('general_documents').insert({
    organization_id: profile.organization_id,
    category: d.category,
    title: d.title,
    document_number: d.number ?? null,
    issued_on: d.issued_on ?? null,
    expires_on: d.expires_on ?? null,
    file_path: filePath,
  });

  if (error) {
    if (filePath) await supabase.storage.from('documents').remove([filePath]); // best effort
    return { error: mapDbError(error), values };
  }

  revalidatePath('/documents');
  redirect('/documents?tab=general&saved=1');
}
