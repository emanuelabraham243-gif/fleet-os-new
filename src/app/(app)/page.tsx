import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { todayAddis, formatDate, formatNumber } from '@/lib/format';
import { classifySignal, getGpsProvider } from '@/lib/gps';
import { currentTripByVehicle, fleetCounts } from '@/lib/vehicle-file';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Section, StatusBadge, statusTone } from '@/components/ui';
import { buildAttention, attentionCutoff } from '@/components/home/attention';
import { priorityTone, reminderText } from '@/components/home/reminder-text';
import { rows } from '@/components/home/query';


type Vehicle = { id: string; name: string; plate_number: string; status: string };
type Driver = { id: string; name: string; status: string; license_expiry: string | null };

const ATTENTION_REMINDERS = ['MISSING_FUEL_RECORD', 'MISSING_TRIP_REVENUE', 'STALE_TRIP'];

export default async function HomePage() {
  await requireViewer();
  const i18n = await getI18n();
  const { t, label, locale } = i18n;
  const supabase = await createClient();
  const today = todayAddis();
  const cutoff = attentionCutoff(today);

  const [vehiclesR, tripsR, driversR, vdocsR, ddocsR, maintR, incR, attnRemR, upcomingR] = await Promise.all([
    supabase.from('vehicles').select('id, name, plate_number, status').order('name'),
    supabase
      .from('trips')
      .select('id, vehicle_id, driver_id, trip_date, created_at')
      .eq('status', 'IN_PROGRESS')
      .is('voided_at', null),
    supabase.from('drivers').select('id, name, status, license_expiry'),
    supabase
      .from('v_vehicle_documents')
      .select('id, vehicle_id, document_type, expires_on')
      .not('expires_on', 'is', null)
      .lte('expires_on', cutoff),
    supabase
      .from('v_driver_documents')
      .select('id, driver_id, document_type, expires_on')
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
  ]);

  const vehicles = rows<Vehicle>(vehiclesR);
  const trips = rows<{ id: string; vehicle_id: string; driver_id: string; trip_date: string; created_at: string }>(tripsR);
  const drivers = rows<Driver>(driversR);
  const vdocs = rows<{ id: string; vehicle_id: string; document_type: string; expires_on: string | null }>(vdocsR);
  const ddocs = rows<{ id: string; driver_id: string; document_type: string; expires_on: string | null }>(ddocsR);
  const maint = rows<{ id: string; vehicle_id: string; service_category: string }>(maintR);
  const incidents = rows<{ id: string; vehicle_id: string; title: string }>(incR);
  const attnReminders = rows<{ id: string; type: string; params: unknown; entity_id: string }>(attnRemR);
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

      <Section title={t('home.quickTitle')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LinkButton href="/new/fuel">{t('home.quick.fuel')}</LinkButton>
          <LinkButton href="/new/trip" variant="secondary">
            {t('home.quick.trip')}
          </LinkButton>
          <LinkButton href="/new/incident" variant="secondary">
            {t('home.quick.incident')}
          </LinkButton>
        </div>
      </Section>

      <Section title={t('home.attentionTitle')}>
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
                        <p className="text-base text-muted">{v.plate_number}</p>
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

      <GpsSection vehicles={vehicles} />
    </div>
  );
}

async function GpsSection({ vehicles }: { vehicles: Vehicle[] }) {
  const { t, locale } = await getI18n();
  if (vehicles.length === 0) return null;
  const provider = getGpsProvider();
  const positions = await provider.getLatest(vehicles.map((v) => v.id));
  const byVehicle = new Map(positions.map((p) => [p.vehicleId, p]));

  return (
    <Section title={t('home.gpsTitle')}>
      <p className="mb-2 text-base text-muted">{t('home.gpsOptionalNote')}</p>
      {provider.name === 'mock' ? <p className="mb-3 text-base text-muted">{t('gps.mockNote')}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {vehicles.map((v) => {
          const pos = byVehicle.get(v.id);
          const sig = classifySignal(pos?.timestamp ?? null);
          const showCoords = sig.state === 'LIVE' && pos?.latitude != null && pos?.longitude != null;
          let ago: string;
          if (sig.minutesAgo == null) ago = t('gps.noSignal');
          else if (sig.minutesAgo < 60) ago = t('gps.lastSignalMinutes', { n: sig.minutesAgo });
          else ago = t('gps.lastSignalHours', { n: Math.floor(sig.minutesAgo / 60) });
          return (
            <li key={v.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{v.name}</p>
                    <p className="text-base text-muted">{v.plate_number}</p>
                  </div>
                  <GpsBadge state={sig.state} />
                </div>
                <p className="mt-2 text-base">{ago}</p>
                {showCoords ? (
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {t('home.gpsPosition')}: {formatNumber(pos!.latitude, locale, 4)}, {formatNumber(pos!.longitude, locale, 4)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted">{t('home.gpsNoPosition')}</p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

async function GpsBadge({ state }: { state: string }) {
  const { label } = await getI18n();
  return <Badge tone={statusTone('gpsState', state)}>{label('gpsState', state)}</Badge>;
}
