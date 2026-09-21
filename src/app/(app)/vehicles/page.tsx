import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatKm } from '@/lib/format';
import { currentTripByVehicle } from '@/lib/vehicle-file';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { rows } from '@/components/home/query';

type Vehicle = {
  id: string;
  name: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  current_odometer: number | string | null;
};

export default async function VehiclesPage() {
  await requireViewer();
  const { t, locale } = await getI18n();
  const supabase = await createClient();

  const [vehiclesR, tripsR, driversR] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, name, plate_number, make, model, year, status, current_odometer')
      .order('name'),
    supabase
      .from('trips')
      .select('id, vehicle_id, driver_id, trip_date, created_at')
      .eq('status', 'IN_PROGRESS')
      .is('voided_at', null),
    supabase.from('drivers').select('id, name'),
  ]);

  const vehicles = rows<Vehicle>(vehiclesR);
  const trips = rows<{ id: string; vehicle_id: string; driver_id: string; trip_date: string; created_at: string }>(tripsR);
  const drivers = new Map(rows<{ id: string; name: string }>(driversR).map((d) => [d.id, d.name]));
  const openTrips = currentTripByVehicle(trips);

  return (
    <div>
      <PageHeader title={t('vehicles.title')} />
      {vehicles.length === 0 ? (
        <EmptyState title={t('vehicles.empty')} hint={t('vehicles.emptyHint')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => {
            const trip = openTrips.get(v.id);
            const driver = trip ? drivers.get(trip.driver_id) : undefined;
            const makeModel = [v.make, v.model, v.year].filter((x) => x != null && x !== '').join(' ');
            const odo = v.current_odometer == null ? null : Number(v.current_odometer);
            return (
              <li key={v.id}>
                <Link
                  href={`/vehicles/${v.id}`}
                  aria-label={`${t('vehicles.viewFile')}: ${v.name}`}
                  className="block min-h-14 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:bg-muted-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">{v.name}</p>
                      <p className="text-base text-muted">{v.plate_number}</p>
                      {makeModel ? <p className="text-base text-muted">{makeModel}</p> : null}
                    </div>
                    <StatusBadge group="vehicleStatus" code={v.status} />
                  </div>
                  <dl className="mt-3 space-y-1 text-base">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{t('vehicles.odometer')}</dt>
                      <dd className="tabular-nums">{odo == null ? t('common.unknown') : formatKm(odo, locale)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{t('vehicles.currentDriver')}</dt>
                      <dd>{driver ?? t('common.unknown')}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-base font-semibold text-brand-ink">{t('vehicles.viewFile')}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
