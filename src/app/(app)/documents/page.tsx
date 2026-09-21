import { getI18n } from '@/lib/i18n';
import { requireViewer, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, todayAddis } from '@/lib/format';
import { Card, Chips, EmptyState, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { VoidForm } from '@/components/forms-core';
import { DocumentForm } from './document-form';

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type DocRow = {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
  document_type: string;
  document_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  status: string | null;
  days_left: number | null;
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireViewer();
  const admin = isAdmin(profile);
  const { t, label, locale } = await getI18n();
  const supabase = await createClient();
  const today = todayAddis();

  const kind: 'vehicle' | 'driver' = first(sp.tab) === 'driver' ? 'driver' : 'vehicle';
  const ownerKey = kind === 'vehicle' ? 'vehicle_id' : 'driver_id';

  const [ownersRes, docsRes] = await Promise.all([
    kind === 'vehicle'
      ? supabase.from('vehicles').select('id, name, plate_number').order('name', { ascending: true })
      : supabase.from('drivers').select('id, name').order('name', { ascending: true }),
    supabase
      .from(kind === 'vehicle' ? 'v_vehicle_documents' : 'v_driver_documents')
      .select('*')
      .order('expires_on', { ascending: true, nullsFirst: false })
      .limit(200),
  ]);

  const owners = ((ownersRes.data ?? []) as { id: string; name: string; plate_number?: string }[]).map((o) => ({
    id: o.id,
    label: o.plate_number ? `${o.name} · ${o.plate_number}` : o.name,
  }));
  const ownerMap = new Map(owners.map((o) => [o.id, o.label]));
  const docs = (docsRes.data ?? []) as DocRow[];

  // One batched call; signed URLs are short-lived (5 minutes) and never stored.
  const paths = docs.map((d) => d.file_path).filter((p): p is string => Boolean(p));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(paths, 300);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  const returnTo = `/documents?tab=${kind}`;
  const tabs = [
    { href: '/documents?tab=vehicle', label: t('documents.tabVehicle'), active: kind === 'vehicle' },
    { href: '/documents?tab=driver', label: t('documents.tabDriver'), active: kind === 'driver' },
  ];

  return (
    <div>
      <PageHeader title={t('documents.title')} subtitle={t('documents.subtitle')} />
      <Flash saved={sp.saved} error={sp.error} />
      <Chips items={tabs} />

      <details className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
          {t('documents.add')}
        </summary>
        <div className="mt-3">
          {owners.length === 0 ? (
            <p className="text-base text-muted">{t('documents.noOwners')}</p>
          ) : (
            <DocumentForm key={kind} kind={kind} owners={owners} today={today} />
          )}
        </div>
      </details>

      {docs.length === 0 ? (
        <EmptyState title={t('documents.empty')} hint={t('documents.emptyHint')} />
      ) : (
        <div className="space-y-3">
          {docs.map((d) => {
            const ownerId = d[ownerKey];
            const url = d.file_path ? urlByPath.get(d.file_path) : undefined;
            const status = d.status ?? 'UNKNOWN';
            const n = d.days_left;
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-snug">{label('documentType', d.document_type)}</p>
                    <p className="text-base text-muted">{ownerId ? (ownerMap.get(ownerId) ?? '') : ''}</p>
                  </div>
                  <StatusBadge group="docStatus" code={status} />
                </div>
                <dl className="mt-3 space-y-1 text-base">
                  {d.document_number ? (
                    <div><dd>{t('documents.number', { value: d.document_number })}</dd></div>
                  ) : null}
                  {d.issued_on ? (
                    <div><dd>{t('documents.issued', { date: formatDate(d.issued_on, locale) })}</dd></div>
                  ) : null}
                  <div>
                    <dd>
                      {d.expires_on ? (
                        <>
                          {t('documents.expires', { date: formatDate(d.expires_on, locale) })}
                          {n != null ? (
                            <span className="text-muted">
                              {' · '}
                              {n === 0
                                ? t('documents.expiresToday')
                                : n === 1
                                  ? t('documents.dayLeft')
                                  : n > 1
                                    ? t('documents.daysLeft', { n })
                                    : t('documents.daysOver', { n: Math.abs(n) })}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted">{t('documents.expiryUnknown')}</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-col gap-2">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 py-2 text-base font-semibold hover:bg-muted-soft"
                    >
                      {t('documents.viewFile')}
                    </a>
                  ) : (
                    <p className="text-sm text-muted">{t('documents.noFile')}</p>
                  )}
                  {admin ? (
                    <VoidForm
                      table={kind === 'vehicle' ? 'vehicle_documents' : 'driver_documents'}
                      id={d.id}
                      returnTo={returnTo}
                    />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
