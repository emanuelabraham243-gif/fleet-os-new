import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { todayAddis } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { rows } from '@/components/home/query';
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

  const vehicles = rows<{ id: string; name: string; plate_number: string; status: string }>(vRes).map((v) => ({
    value: v.id,
    label: `${v.name} · ${v.plate_number} (${label('vehicleStatus', v.status)})`,
  }));
  const drivers = rows<{ id: string; name: string }>(dRes).map((d) => ({ value: d.id, label: d.name }));

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
