import { getI18n, type I18n } from '@/lib/i18n';
import { requireViewer, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, todayAddis } from '@/lib/format';
import { Card, Badge, Chips, EmptyState, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { rows } from '@/components/home/query';
import { VoidForm } from '@/components/forms-core';
import { DocumentForm } from './document-form';
import { GeneralDocumentForm } from './general-document-form';

type SP = Record<string, string | string[] | undefined>;
type Kind = 'vehicle' | 'driver' | 'general';
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
  superseded?: boolean | null;
};

type GeneralDocRow = {
  id: string;
  category: string;
  title: string;
  document_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  status: string | null;
  days_left: number | null;
};

const DOC_LIMIT = 200;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireViewer();
  const admin = isAdmin(profile);
  const i18n = await getI18n();
  const { t } = i18n;
  const supabase = await createClient();
  const today = todayAddis();

  const tabParam = first(sp.tab);
  const kind: Kind = tabParam === 'driver' ? 'driver' : tabParam === 'general' ? 'general' : 'vehicle';

  const returnTo = `/documents?tab=${kind}`;
  const tabs = [
    { href: '/documents?tab=vehicle', label: t('documents.tabVehicle'), active: kind === 'vehicle' },
    { href: '/documents?tab=driver', label: t('documents.tabDriver'), active: kind === 'driver' },
    { href: '/documents?tab=general', label: t('documents.tabGeneral'), active: kind === 'general' },
  ];

  if (kind === 'general') {
    const docsRes = await supabase
      .from('v_general_documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(DOC_LIMIT);
    const docs = rows<GeneralDocRow>(docsRes);

    const paths = docs.map((d) => d.file_path).filter((p): p is string => Boolean(p));
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from('documents').createSignedUrls(paths, 300);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }

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
            <GeneralDocumentForm today={today} />
          </div>
        </details>

        {docs.length === 0 ? (
          <EmptyState title={t('documents.generalEmpty')} hint={t('documents.generalEmptyHint')} />
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <GeneralDocCard key={d.id} d={d} i18n={i18n} url={d.file_path ? urlByPath.get(d.file_path) : undefined} admin={admin} returnTo={returnTo} />
            ))}
          </div>
        )}
        {docs.length >= DOC_LIMIT ? (
          <p className="mt-4 text-sm text-muted">{t('documents.limitNote', { n: DOC_LIMIT })}</p>
        ) : null}
      </div>
    );
  }

  const ownerKey = kind === 'vehicle' ? 'vehicle_id' : 'driver_id';

  const [ownersRes, docsRes] = await Promise.all([
    kind === 'vehicle'
      ? supabase.from('vehicles').select('id, name, plate_number').order('name', { ascending: true })
      : supabase.from('drivers').select('id, name').order('name', { ascending: true }),
    supabase
      .from(kind === 'vehicle' ? 'v_vehicle_documents' : 'v_driver_documents')
      .select('*')
      .order('expires_on', { ascending: true, nullsFirst: false })
      .limit(DOC_LIMIT),
  ]);

  const owners = rows<{ id: string; name: string; plate_number?: string }>(ownersRes).map((o) => ({
    id: o.id,
    label: o.plate_number ? `${o.name} · ${o.plate_number}` : o.name,
  }));
  const ownerMap = new Map(owners.map((o) => [o.id, o.label]));
  const allDocs = rows<DocRow>(docsRes);
  const docs = allDocs.filter((d) => d.superseded !== true);
  const replaced = allDocs.filter((d) => d.superseded === true);

  // One batched call; signed URLs are short-lived (5 minutes) and never stored.
  const paths = allDocs.map((d) => d.file_path).filter((p): p is string => Boolean(p));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from('documents').createSignedUrls(paths, 300);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  const ctx: Ctx = { i18n, kind, ownerKey, ownerMap, urlByPath, admin, returnTo };

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

      {allDocs.length === 0 ? (
        <EmptyState title={t('documents.empty')} hint={t('documents.emptyHint')} />
      ) : (
        <>
          <div className="space-y-3">
            {docs.map((d) => (
              <DocCard key={d.id} d={d} ctx={ctx} />
            ))}
          </div>
          {replaced.length > 0 ? (
            <details className="mt-6 rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-semibold text-muted">
                {t('documents.replacedTitle', { n: replaced.length })}
              </summary>
              <div className="space-y-3 p-3">
                {replaced.map((d) => (
                  <DocCard key={d.id} d={d} ctx={ctx} muted />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
      {allDocs.length >= DOC_LIMIT ? (
        <p className="mt-4 text-sm text-muted">{t('documents.limitNote', { n: DOC_LIMIT })}</p>
      ) : null}
    </div>
  );
}

type Ctx = {
  i18n: I18n;
  kind: 'vehicle' | 'driver';
  ownerKey: 'vehicle_id' | 'driver_id';
  ownerMap: Map<string, string>;
  urlByPath: Map<string, string>;
  admin: boolean;
  returnTo: string;
};

function DocCard({ d, ctx, muted = false }: { d: DocRow; ctx: Ctx; muted?: boolean }) {
  const { t, label, locale } = ctx.i18n;
  const ownerId = d[ctx.ownerKey];
  const url = d.file_path ? ctx.urlByPath.get(d.file_path) : undefined;
  const status = d.status ?? 'UNKNOWN';
  const n = d.days_left;
  return (
    <Card className={muted ? 'bg-muted-soft' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-lg font-semibold leading-snug ${muted ? 'text-muted' : ''}`}>
            {label('documentType', d.document_type)}
          </p>
          <p className="text-base text-muted">{ownerId ? (ctx.ownerMap.get(ownerId) ?? '') : ''}</p>
        </div>
        {muted ? <Badge tone="gray">{t('documents.replacedBadge')}</Badge> : <StatusBadge group="docStatus" code={status} />}
      </div>
      <dl className="mt-3 space-y-1 text-base">
        {d.document_number ? (
          <div>
            <dt className="sr-only">{t('documents.formNumber')}</dt>
            <dd>{t('documents.number', { value: d.document_number })}</dd>
          </div>
        ) : null}
        {d.issued_on ? (
          <div>
            <dt className="sr-only">{t('documents.formIssued')}</dt>
            <dd>{t('documents.issued', { date: formatDate(d.issued_on, locale) })}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t('documents.formExpires')}</dt>
          <dd>
            {d.expires_on ? (
              <>
                {t('documents.expires', { date: formatDate(d.expires_on, locale) })}
                {n != null && !muted ? (
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
        {ctx.admin ? (
          <VoidForm
            table={ctx.kind === 'vehicle' ? 'vehicle_documents' : 'driver_documents'}
            id={d.id}
            returnTo={ctx.returnTo}
          />
        ) : null}
      </div>
    </Card>
  );
}

function GeneralDocCard({
  d, i18n, url, admin, returnTo,
}: {
  d: GeneralDocRow;
  i18n: I18n;
  url: string | undefined;
  admin: boolean;
  returnTo: string;
}) {
  const { t, label, locale } = i18n;
  const status = d.status ?? 'UNKNOWN';
  const n = d.days_left;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug">{d.title}</p>
          <p className="text-base text-muted">{label('generalDocCategory', d.category)}</p>
        </div>
        <StatusBadge group="docStatus" code={status} />
      </div>
      <dl className="mt-3 space-y-1 text-base">
        {d.document_number ? (
          <div>
            <dt className="sr-only">{t('documents.formNumber')}</dt>
            <dd>{t('documents.number', { value: d.document_number })}</dd>
          </div>
        ) : null}
        {d.issued_on ? (
          <div>
            <dt className="sr-only">{t('documents.formIssued')}</dt>
            <dd>{t('documents.issued', { date: formatDate(d.issued_on, locale) })}</dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t('documents.formExpires')}</dt>
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
        {admin ? <VoidForm table="general_documents" id={d.id} returnTo={returnTo} /> : null}
      </div>
    </Card>
  );
}
