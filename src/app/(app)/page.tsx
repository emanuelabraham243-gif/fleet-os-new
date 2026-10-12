import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { todayAddis, formatDate, formatEtb, formatNumber } from '@/lib/format';
import { toCents } from '@/lib/money';
import { currentTripByVehicle, fleetCounts, plateIfDifferent } from '@/lib/vehicle-file';
import { Badge, Card, EmptyState, Flash, PageHeader, Section, StatusBadge } from '@/components/ui';
import { buildAttention, attentionCutoff } from '@/components/home/attention';
import { priorityTone, reminderText } from '@/components/home/reminder-text';
import { rows } from '@/components/home/query';


type Vehicle = { id: string; name: string; plate_number: string; status: string };
type Driver = { id: string; name: string; status: string; license_expiry: string | null };

const ATTENTION_REMINDERS = ['MISSING_FUEL_RECORD', 'MISSING_TRIP_REVENUE', 'STALE_TRIP'];

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  await requireViewer();
  const sp = await searchParams;
  const i18n = await getI18n();
  const { t, label, locale } = i18n;
  const supabase = await createClient();
  const today = todayAddis();
  const cutoff = attentionCutoff(today);

  const [vehiclesR, tripsR, driversR, vdocsR, ddocsR, maintR, incR, attnRemR, upcomingR, activeR] = await Promise.all([
    supabase.from('vehicles').select('id, name, plate_number, status').order('name'),
    supabase
      .from('trips')
      .select('id, vehicle_id, driver_id, trip_date, created_at')
      .eq('status', 'IN_PROGRESS')
      .is('voided_at', null),
    supabase.from('drivers').select('id, name, status, license_expiry'),
    supabase
      .from('v_vehicle_documents')
      .select('id, vehicle_id, document_type, expires_on, superseded')
      .not('expires_on', 'is', null)
      .lte('expires_on', cutoff),
    supabase
      .from('v_driver_documents')
      .select('id, driver_id, document_type, expires_on, superseded')
      .not('expires_on', 'is', null)
      .lte('expires_on', cutoff),
    supabase
      .from('v_maintenance_status')
      .select('id, vehicle_id, service_category')
      .eq('overall_status', 'OVERDUE'),
    supabase.from('incidents').select('id, vehicle_id, title').eq('status', 'OPEN').is('voided_at', null),
    supabase
      .from('reminders')
      .select('id, type, params, entity_id')
      .eq('status', 'PENDING')
      .in('type', ATTENTION_REMINDERS)
      .limit(20),
    supabase
      .from('reminders')
      .select('id, type, params, due_on, priority')
      .eq('status', 'PENDING')
      .order('due_on', { ascending: true, nullsFirst: false })
      .limit(8),
    // Trips on the road: the everyday "add an expense" entry point.
    supabase
      .from('v_trip_financials')
      .select('trip_id, vehicle_id, trip_date, origin, destination, expenses, has_expenses')
      .eq('status', 'IN_PROGRESS')
      .order('trip_date', { ascending: false }),
  ]);

  const vehicles = rows<Vehicle>(vehiclesR);
  const trips = rows<{ id: string; vehicle_id: string; driver_id: string; trip_date: string; created_at: string }>(tripsR);
  const drivers = rows<Driver>(driversR);
  const vdocs = rows<{ id: string; vehicle_id: string; document_type: string; expires_on: string | null; superseded: boolean | null }>(vdocsR);
  const ddocs = rows<{ id: string; driver_id: string; document_type: string; expires_on: string | null; superseded: boolean | null }>(ddocsR);
  const maint = rows<{ id: string; vehicle_id: string; service_category: string }>(maintR);
  const incidents = rows<{ id: string; vehicle_id: string; title: string }>(incR);
  const attnReminders = rows<{ id: string; type: string; params: unknown; entity_id: string }>(attnRemR);
  const active = rows<{
    trip_id: string;
    vehicle_id: string;
    trip_date: string;
    origin: string;
    destination: string;
    expenses: number | string | null;
    has_expenses: boolean;
  }>(activeR);
  const upcoming = rows<{ id: string; type: string; params: unknown; due_on: string | null; priority: string }>(upcomingR);

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const openTrips = currentTripByVehicle(trips);
  const counts = fleetCounts(vehicles);

  const attention = buildAttention(i18n, {
    today,
    vehicles: vehicleMap,
    drivers: driverMap,
    vehicleDocs: vdocs,
    driverDocs: ddocs,
    maintenance: maint,
    incidents,
    reminders: attnReminders,
  });

  const countCards: { key: keyof typeof counts; label: string }[] = [
    { key: 'total', label: t('home.counts.total') },
    { key: 'onTrip', label: t('home.counts.onTrip') },
    { key: 'available', label: t('home.counts.available') },
    { key: 'maintenance', label: t('home.counts.maintenance') },
  ];

  return (
    <div>
      <PageHeader title={t('navFull.home')} />
      <Flash saved={sp.saved} />

      <Section title={t('home.attentionTitle')}>
        {active.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-2 text-base font-semibold text-muted">{t('home.activeTrips')}</h3>
            <ul className="space-y-2">
              {active.map((tr) => {
                const v = vehicleMap.get(tr.vehicle_id);
                const driver = driverMap.get(openTrips.get(tr.vehicle_id)?.driver_id ?? '')?.name;
                return (
                  <li key={tr.trip_id}>
                    <Card>
                      <p className="text-lg font-semibold leading-snug">
                        {tr.origin} → {tr.destination}
                      </p>
                      <p className="text-base text-muted">
                        {v ? v.plate_number : ''}
                        {driver ? ` · ${driver}` : ''} · {formatDate(tr.trip_date, locale)}
                      </p>
                      <p className="mt-1 text-base">
                        <span className="text-muted">{t('home.expensesSoFar')}: </span>
                        <span className="font-semibold tabular-nums">
                          {formatEtb(tr.has_expenses ? (toCents(tr.expenses) ?? 0) : 0, locale)}
                        </span>
                      </p>
                      <Link
                        href={`/expenses?trip=${tr.trip_id}&from=home`}
                        className="mt-3 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-brand px-5 text-lg font-semibold text-on-brand hover:bg-brand-strong"
                      >
                        {t('home.addExpense')}
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {attention.length === 0 ? (
          <EmptyState title={t('home.attentionEmpty')} hint={t('home.attentionEmptyHint')} />
        ) : (
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="flex min-h-14 flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:bg-muted-soft"
                >
                  <span>
                    <Badge tone={priorityTone(a.severity)}>
                      {label('priority', a.severity)}
                    </Badge>
                  </span>
                  <span className="text-base leading-snug">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('home.fleetTitle')}>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {countCards.map((c) => (
            <Card key={c.key}>
              <p className="text-sm text-muted">{c.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{formatNumber(counts[c.key], locale)}</p>
            </Card>
          ))}
        </div>
        {vehicles.length === 0 ? (
          <EmptyState title={t('home.noVehicles')} hint={t('home.noVehiclesHint')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((v) => {
              const trip = openTrips.get(v.id);
              const driver = trip ? driverMap.get(trip.driver_id)?.name : undefined;
              return (
                <li key={v.id}>
                  <Link
                    href={`/vehicles/${v.id}`}
                    className="block min-h-14 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:bg-muted-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold">{v.name}</p>
                        {plateIfDifferent(v.name, v.plate_number) ? <p className="text-base text-muted">{v.plate_number}</p> : null}
                      </div>
                      <StatusBadge group="vehicleStatus" code={v.status} />
                    </div>
                    <p className="mt-2 text-base">
                      <span className="text-muted">{t('home.driverLabel')}: </span>
                      {driver ?? t('common.unknown')}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title={t('home.upcomingTitle')}
        action={
          <Link href="/notifications" className="inline-flex min-h-12 items-center text-base font-semibold text-brand-ink">
            {t('common.viewAll')}
          </Link>
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState title={t('home.upcomingEmpty')} />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((r) => {
              const text = reminderText(i18n, r.type, r.params);
              return (
                <li key={r.id}>
                  <Card>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold leading-snug">{text.title}</p>
                      <Badge tone={priorityTone(r.priority)}>{label('priority', r.priority)}</Badge>
                    </div>
                    <p className="mt-1 text-base leading-snug">{text.message}</p>
                    {r.due_on ? (
                      <p className="mt-1 text-sm text-muted">
                        {t('reminders.dueOn', { date: formatDate(r.due_on, locale) })}
                      </p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
