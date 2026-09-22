import { requireViewer, isAdmin } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { Card, EmptyState, Flash, PageHeader, StatusBadge } from '@/components/ui';
import { rows } from '@/components/home/query';
import { DriverForm } from './driver-form';

type SP = Promise<Record<string, string | string[] | undefined>>;

type Driver = {
  id: string;
  name: string;
  phone: string | null;
  license_number: string | null;
  license_expiry: string | null;
  status: string;
  notes: string | null;
};

export default async function DriversPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { profile } = await requireViewer();
  const admin = isAdmin(profile);
  const { t, locale } = await getI18n();
  const supabase = await createClient();

  const drivers = rows<Driver>(
    await supabase
      .from('drivers')
      .select('id, name, phone, license_number, license_expiry, status, notes')
      .order('name'),
  );

  return (
    <div>
      <PageHeader title={t('drivers.title')} />
      <Flash saved={sp.saved} error={sp.error} />

      {admin ? (
        <details className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
            {t('drivers.addDriver')}
          </summary>
          <div className="mt-3">
            <DriverForm />
          </div>
        </details>
      ) : null}

      {drivers.length === 0 ? (
        <EmptyState title={t('drivers.empty')} hint={t('drivers.emptyHint')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-lg font-semibold">{d.name}</p>
                  <StatusBadge group="driverStatus" code={d.status} />
                </div>
                <dl className="mt-2 space-y-1 text-base">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t('drivers.form.phone')}</dt>
                    <dd>{d.phone ?? t('common.unknown')}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t('drivers.form.licenseExpiry')}</dt>
                    <dd>{d.license_expiry ? formatDate(d.license_expiry, locale) : t('common.unknown')}</dd>
                  </div>
                </dl>
                {admin ? (
                  <details className="mt-3">
                    <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-brand-ink">
                      {t('common.edit')}
                    </summary>
                    <div className="mt-3">
                      <DriverForm driver={d} />
                    </div>
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
