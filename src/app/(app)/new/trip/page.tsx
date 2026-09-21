import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { todayAddis } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { TripForm } from '../../trips/trip-form';

export default async function NewTripPage() {
  await requireViewer();
  const { t, label } = await getI18n();
  const supabase = await createClient();

  const [vRes, dRes] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, name, plate_number, status')
      .in('status', ['AVAILABLE', 'ON_TRIP'])
      .order('name'),
    supabase.from('drivers').select('id, name').eq('status', 'ACTIVE').order('name'),
  ]);

  const vehicles = (vRes.data ?? []).map((v) => ({
    value: v.id as string,
    label: `${v.name} · ${v.plate_number} (${label('vehicleStatus', v.status as string)})`,
  }));
  const drivers = (dRes.data ?? []).map((d) => ({ value: d.id as string, label: d.name as string }));

  return (
    <div>
      <PageHeader title={t('trips.form.title')} />
      {vehicles.length === 0 || drivers.length === 0 ? (
        <EmptyState
          title={vehicles.length === 0 ? t('trips.form.noVehicles') : t('trips.form.noDrivers')}
        />
      ) : (
        <Card>
          <TripForm vehicles={vehicles} drivers={drivers} today={todayAddis()} />
        </Card>
      )}
    </div>
  );
}
