import { isAdmin, requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, Chips, EmptyState, PageHeader, Pager, Section, type Tone } from '@/components/ui';
import { rows } from '@/components/home/query';

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PAGE_SIZE = 30;

// Every table with the z_audit trigger (see the rls_audit_triggers / v1_revision_pass migrations).
const ENTITY_TYPES = [
  'vehicles', 'drivers', 'fuel_records', 'trips', 'trip_revenue', 'trip_expenses', 'service_records',
  'maintenance_schedules', 'vehicle_documents', 'driver_documents', 'general_documents', 'incidents', 'profiles',
] as const;

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
};

const ACTION_TONE: Record<string, Tone> = {
  INSERT: 'green',
  UPDATE: 'blue',
  VOID: 'amber',
  RESTORE: 'blue',
  DELETE: 'red',
};

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const { profile } = await requireViewer();
  const sp = await searchParams;
  const { t, locale } = await getI18n();

  if (!isAdmin(profile)) {
    return (
      <div>
        <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
        <Card>
          <p className="text-base text-muted">{t('audit.noPermission')}</p>
        </Card>
      </div>
    );
  }

  const entityParam = first(sp.entity);
  const entity = entityParam && (ENTITY_TYPES as readonly string[]).includes(entityParam) ? entityParam : undefined;
  const page = Math.max(1, Number(first(sp.page) ?? '1') | 0 || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, reason, created_at')
    .order('created_at', { ascending: false });
  if (entity) query = query.eq('entity_type', entity);
  query = query.range(offset, offset + PAGE_SIZE);

  const logsRes = await query;
  const rawLogs = rows<AuditRow>(logsRes);
  const hasMore = rawLogs.length > PAGE_SIZE;
  const logs = hasMore ? rawLogs.slice(0, PAGE_SIZE) : rawLogs;

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((id): id is string => Boolean(id)))];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const profilesRes = await supabase.from('profiles').select('id, full_name').in('id', actorIds);
    for (const p of rows<{ id: string; full_name: string }>(profilesRes)) {
      actorMap.set(p.id, p.full_name);
    }
  }

  const baseHref = (extra: Record<string, string>) => {
    const usp = new URLSearchParams();
    if (entity) usp.set('entity', entity);
    for (const [k, v] of Object.entries(extra)) {
      if (v) usp.set(k, v);
      else usp.delete(k);
    }
    const s = usp.toString();
    return s ? `/audit?${s}` : '/audit';
  };

  const chips = [
    { href: baseHref({ entity: '' }), label: t('audit.allEntities'), active: !entity },
    ...ENTITY_TYPES.map((e) => ({ href: baseHref({ entity: e }), label: e.replace(/_/g, ' '), active: entity === e })),
  ];

  return (
    <div>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Chips items={chips} />

      {logs.length === 0 ? (
        <EmptyState title={t('audit.empty')} />
      ) : (
        <Section title="">
          <div className="space-y-2">
            {logs.map((l) => {
              const actorName = l.actor_id ? (actorMap.get(l.actor_id) || undefined) : undefined;
              return (
                <Card key={l.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={ACTION_TONE[l.action] ?? 'gray'}>
                          {t(`audit.action_${l.action}` as `audit.action_${string}`) || l.action}
                        </Badge>
                        <span className="text-base font-semibold">{l.entity_type.replace(/_/g, ' ')}</span>
                      </div>
                      {l.entity_id ? (
                        <p className="mt-1 break-all text-sm text-muted">{l.entity_id}</p>
                      ) : null}
                      {l.reason ? <p className="mt-1 text-base">{l.reason}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-muted">{formatDateTime(l.created_at, locale)}</p>
                      <p className="text-base font-medium">{actorName ?? t('audit.systemActor')}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      <Pager
        page={page}
        hasMore={hasMore}
        prevHref={page > 1 ? baseHref({ page: page > 2 ? String(page - 1) : '' }) : null}
        nextHref={baseHref({ page: String(page + 1) })}
        prevLabel={t('common.previous')}
        nextLabel={t('common.next')}
        pageLabel={t('common.page', { n: page })}
      />
    </div>
  );
}
