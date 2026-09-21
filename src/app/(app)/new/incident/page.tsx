import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { isoToAddisLocal } from '@/lib/trip-rules';
import { Card, PageHeader } from '@/components/ui';
import { IncidentForm } from './incident-form';

type SP = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewIncidentPage({ searchParams }: { searchParams: SP }) {
  await requireViewer();
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const vParam = Array.isArray(sp.vehicle) ? sp.vehicle[0] : sp.vehicle;

  const supabase = await createClient();
  const { data: vData } = await supabase.from('vehicles').select('id, name, plate_number').order('name');
  const vehicles = vData ?? [];
  const vehicle = vParam && UUID.test(vParam) ? vehicles.find((v) => v.id === vParam) : undefined;

  if (!vehicle) {
    return (
      <div>
        <PageHeader title={t('incidents.title')} subtitle={t('incidents.pickVehicle')} />
        <Card>
          <form method="get" action="/new/incident">
            <label htmlFor="pick-vehicle" className="mb-1 block text-base font-medium">
              {t('incidents.vehicle')}
            </label>
            <select
              id="pick-vehicle"
              name="vehicle"
              required
              defaultValue=""
              className="mb-4 block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
            >
              <option value="" disabled>
                {t('incidents.choose')}
              </option>
              {vehicles.map((v) => (
                <option key={v.id as string} value={v.id as string}>
                  {`${v.name} · ${v.plate_number}`}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 py-2 text-base font-semibold text-on-brand hover:bg-brand-strong sm:w-auto"
            >
              {t('incidents.next')}
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const [dRes, tRes] = await Promise.all([
    supabase.from('drivers').select('id, name').order('name'),
    supabase
      .from('trips')
      .select('id, trip_date, origin, destination')
      .eq('vehicle_id', vehicle.id as string)
      .is('voided_at', null)
      .order('trip_date', { ascending: false })
      .limit(20),
  ]);

  const drivers = (dRes.data ?? []).map((d) => ({ value: d.id as string, label: d.name as string }));
  const trips = (tRes.data ?? []).map((x) => ({
    value: x.id as string,
    label: `${formatDate(x.trip_date as string, locale)} · ${x.origin} → ${x.destination}`,
  }));

  return (
    <div>
      <PageHeader title={t('incidents.title')} subtitle={`${vehicle.name} · ${vehicle.plate_number}`} />
      <Card>
        <IncidentForm
          vehicleId={vehicle.id as string}
          drivers={drivers}
          trips={trips}
          nowLocal={isoToAddisLocal(new Date())}
        />
      </Card>
    </div>
  );
}
