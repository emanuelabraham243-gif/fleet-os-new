import { getI18n, type I18n } from '@/lib/i18n';
import { requireViewer, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { daysBetween, formatDate, formatEtb, formatKm, todayAddis } from '@/lib/format';
import { toCents } from '@/lib/money';
import {
  MAINT_STATUS_ORDER, SERVICE_CATEGORIES, normalizeStatus, remainingKm, unknownReason,
  type MaintStatus,
} from '@/lib/maintenance-rules';
import { Card, Chips, EmptyState, Flash, PageHeader, Section, StatusBadge } from '@/components/ui';
import { rows as unwrap } from '@/components/home/query';
import { VoidForm } from '@/components/forms-core';
import { ServiceForm } from './service-form';
import { ScheduleForm } from './schedule-form';

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

type Schedule = {
  id: string;
  vehicle_id: string;
  vehicle_name: string | null;
  plate_number: string | null;
  service_category: string;
  interval_km: number | string | null;
  interval_days: number | null;
  next_due_date: string | null;
  next_due_odometer: number | string | null;
  current_odometer: number | string | null;
  overall_status: string | null;
};

type ServiceRow = {
  id: string;
  vehicle_id: string;
  service_date: string;
  category: string;
  description: string | null;
  odometer: number | string | null;
  cost: number | string | null;
  service_provider: string | null;
};

function remainingDaysText(i18n: I18n, dueDate: string, today: string): string {
  const n = daysBetween(today, dueDate);
  if (n === 0) return i18n.t('maintenance.dueToday');
  if (n === 1) return i18n.t('maintenance.dayLeft');
  if (n > 1) return i18n.t('maintenance.daysLeft', { n });
  return i18n.t('maintenance.daysOver', { n: Math.abs(n) });
}

function ScheduleCard({ s, i18n, today }: { s: Schedule; i18n: I18n; today: string }) {
  const { t, label, locale } = i18n;
  const status = normalizeStatus(s.overall_status);
  const reason = unknownReason(s);
  const current = num(s.current_odometer);
  const dueKm = num(s.next_due_odometer);
  const left = remainingKm(s.next_due_odometer, s.current_odometer);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug">{label('serviceCategory', s.service_category)}</p>
          <p className="text-base text-muted">
            {s.vehicle_name} · {s.plate_number}
          </p>
        </div>
        <StatusBadge group="maintenanceStatus" code={status} />
      </div>
      <dl className="mt-3 space-y-1 text-base">
        {s.next_due_date ? (
          <div>
            <dt className="sr-only">{t('maintenance.nextDueDate')}</dt>
            <dd>
              {t('maintenance.dueDate', { date: formatDate(s.next_due_date, locale) })}
              <span className="text-muted"> · {remainingDaysText(i18n, s.next_due_date, today)}</span>
            </dd>
          </div>
        ) : null}
        {dueKm != null ? (
          <div>
            <dt className="sr-only">{t('maintenance.dueKmLabel')}</dt>
            <dd>
              {t('maintenance.dueKm', { km: formatKm(dueKm, locale) })}
              {left != null ? (
                <span className="text-muted">
                  {' · '}
                  {left >= 0
                    ? t('maintenance.kmLeft', { km: formatKm(left, locale) })
                    : t('maintenance.kmOver', { km: formatKm(Math.abs(left), locale) })}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">{t('maintenance.odometer')}</dt>
          <dd className="text-muted">
            {current != null
              ? t('maintenance.currentOdometer', { km: formatKm(current, locale) })
              : t('maintenance.odometerUnknown')}
          </dd>
        </div>
        {s.interval_km != null || s.interval_days != null ? (
          <div>
            <dt className="sr-only">{t('maintenance.intervalLabel')}</dt>
            <dd className="text-sm text-muted">
              {[
                s.interval_km != null ? t('maintenance.everyKm', { km: formatKm(num(s.interval_km), locale) }) : null,
                s.interval_days != null ? t('maintenance.everyDays', { n: s.interval_days }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        ) : null}
      </dl>
      {reason ? (
        <p className="mt-3 rounded-xl bg-muted-soft px-3 py-2 text-sm text-muted-ink">
          {reason === 'noDueInfo' ? t('maintenance.unknownNoDue') : t('maintenance.unknownNoOdometer')}
        </p>
      ) : null}
    </Card>
  );
}

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireViewer();
  const admin = isAdmin(profile);
  const i18n = await getI18n();
  const { t, label, locale } = i18n;
  const supabase = await createClient();
  const today = todayAddis();

  const category = first(sp.category);
  const vehicleFilter = first(sp.vehicle);

  const [vehiclesRes, schedulesRes, catsRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, name, plate_number, current_odometer')
      .order('name', { ascending: true }),
    supabase.from('v_maintenance_status').select('*').order('next_due_date', { ascending: true, nullsFirst: false }),
    supabase.from('service_records').select('category').is('voided_at', null).limit(1000),
  ]);

  const vehicles = unwrap<{
    id: string; name: string; plate_number: string; current_odometer: number | string | null;
  }>(vehiclesRes);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const allSchedules = unwrap<Schedule>(schedulesRes);

  const catCodes = new Set<string>();
  for (const s of allSchedules) catCodes.add(s.service_category);
  for (const r of unwrap<{ category: string }>(catsRes)) catCodes.add(r.category);
  const orderedCats = [
    ...SERVICE_CATEGORIES.filter((c) => catCodes.has(c)),
    ...[...catCodes].filter((c) => !(SERVICE_CATEGORIES as readonly string[]).includes(c)).sort(),
  ];
  const activeCategory = category && catCodes.has(category) ? category : undefined;
  const activeVehicle = vehicleFilter && vehicleMap.has(vehicleFilter) ? vehicleFilter : undefined;

  let recQuery = supabase
    .from('service_records')
    .select('id, vehicle_id, service_date, category, description, odometer, cost, service_provider')
    .is('voided_at', null)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);
  if (activeCategory) recQuery = recQuery.eq('category', activeCategory);
  if (activeVehicle) recQuery = recQuery.eq('vehicle_id', activeVehicle);
  const recRes = await recQuery;
  const records = unwrap<ServiceRow>(recRes);

  const schedules = allSchedules.filter(
    (s) => (!activeCategory || s.service_category === activeCategory) && (!activeVehicle || s.vehicle_id === activeVehicle),
  );

  const hrefFor = (cat?: string) => {
    const q = new URLSearchParams();
    if (cat) q.set('category', cat);
    if (activeVehicle) q.set('vehicle', activeVehicle);
    const s = q.toString();
    return s ? `/maintenance?${s}` : '/maintenance';
  };
  const chips = [
    { href: hrefFor(), label: t('common.all'), active: !activeCategory },
    ...orderedCats.map((c) => ({ href: hrefFor(c), label: label('serviceCategory', c), active: activeCategory === c })),
  ];

  const vehicleOptions = vehicles.map((v) => ({ id: v.id, label: `${v.name} · ${v.plate_number}` }));
  const returnTo = hrefFor(activeCategory);

  const byStatus = new Map<MaintStatus, Schedule[]>(MAINT_STATUS_ORDER.map((k) => [k, []]));
  for (const s of schedules) byStatus.get(normalizeStatus(s.overall_status))!.push(s);

  return (
    <div>
      <PageHeader title={t('maintenance.title')} subtitle={t('maintenance.subtitle')} />
      <Flash saved={sp.saved} error={sp.error} />

      <details className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
          {t('maintenance.addService')}
        </summary>
        <div className="mt-3">
          {vehicleOptions.length === 0 ? (
            <p className="text-base text-muted">{t('maintenance.noVehicles')}</p>
          ) : (
            <ServiceForm vehicles={vehicleOptions} today={today} defaultVehicle={activeVehicle} />
          )}
        </div>
      </details>

      {admin ? (
        <details className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
            {t('maintenance.addSchedule')}
          </summary>
          <div className="mt-3">
            {vehicleOptions.length === 0 ? (
              <p className="text-base text-muted">{t('maintenance.noVehicles')}</p>
            ) : (
              <ScheduleForm vehicles={vehicleOptions} />
            )}
          </div>
        </details>
      ) : null}

      <Chips items={chips} />

      <form method="get" action="/maintenance" className="mb-6 flex flex-wrap items-end gap-2">
        {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
        <div className="min-w-0 flex-1">
          <label htmlFor="vehicle-filter" className="mb-1 block text-base font-medium">
            {t('maintenance.filterVehicle')}
          </label>
          <select
            id="vehicle-filter"
            name="vehicle"
            defaultValue={activeVehicle ?? ''}
            className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
          >
            <option value="">{t('maintenance.allVehicles')}</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft"
        >
          {t('maintenance.apply')}
        </button>
      </form>

      {schedules.length === 0 ? (
        <div className="mb-6">
          <EmptyState title={t('maintenance.schedulesEmpty')} hint={t('maintenance.schedulesEmptyHint')} />
        </div>
      ) : (
        MAINT_STATUS_ORDER.map((st) => {
          const rows = byStatus.get(st) ?? [];
          if (rows.length === 0) return null;
          return (
            <Section key={st} title={`${label('maintenanceStatus', st)} (${rows.length})`}>
              <div className="space-y-3">
                {rows.map((s) => (
                  <ScheduleCard key={s.id} s={s} i18n={i18n} today={today} />
                ))}
              </div>
            </Section>
          );
        })
      )}

      <Section title={t('maintenance.history')}>
        {records.length === 0 ? (
          <EmptyState title={t('maintenance.historyEmpty')} />
        ) : (
          <div className="space-y-3">
            {records.map((r) => {
              const v = vehicleMap.get(r.vehicle_id);
              const cents = toCents(r.cost);
              const odo = num(r.odometer);
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold leading-snug">{label('serviceCategory', r.category)}</p>
                      <p className="text-base text-muted">
                        {v ? `${v.name} · ${v.plate_number}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-base">{formatDate(r.service_date, locale)}</p>
                  </div>
                  <dl className="mt-2 space-y-1 text-base">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('maintenance.cost')}</dt>
                      <dd className="tabular-nums">
                        {cents != null ? formatEtb(cents, locale) : t('maintenance.costUnknown')}
                      </dd>
                    </div>
                    {r.service_provider ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('maintenance.provider')}</dt>
                        <dd className="text-right">{r.service_provider}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('maintenance.odometer')}</dt>
                      <dd className="tabular-nums">{odo != null ? formatKm(odo, locale) : t('common.unknown')}</dd>
                    </div>
                    {r.description ? (
                      <div>
                        <dt className="sr-only">{t('maintenance.descriptionLabel')}</dt>
                        <dd className="text-muted">{r.description}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {admin ? (
                    <div className="mt-3">
                      <VoidForm table="service_records" id={r.id} returnTo={returnTo} />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
