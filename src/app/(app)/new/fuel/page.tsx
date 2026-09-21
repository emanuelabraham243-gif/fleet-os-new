import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { todayAddis } from '@/lib/format';
import { Card, PageHeader } from '@/components/ui';
import { rows } from '@/components/home/query';
import { FuelForm } from './fuel-form';

type SP = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewFuelPage({ searchParams }: { searchParams: SP }) {
  await requireViewer();
  const sp = await searchParams;
  const { t } = await getI18n();
  const v = Array.isArray(sp.vehicle) ? sp.vehicle[0] : sp.vehicle;

  const supabase = await createClient();
  const data = rows<{ id: string; name: string; plate_number: string }>(
    await supabase.from('vehicles').select('id, name, plate_number').order('name'),
  );
  const vehicles = data.map((x) => ({
    value: x.id,
    label: `${x.name} · ${x.plate_number}`,
  }));
  const defaultVehicle = v && UUID.test(v) && vehicles.some((x) => x.value === v) ? v : undefined;

  return (
    <div>
      <PageHeader title={t('fuel.title')} />
      <Card>
        <FuelForm vehicles={vehicles} defaultVehicle={defaultVehicle} today={todayAddis()} />
      </Card>
    </div>
  );
}
