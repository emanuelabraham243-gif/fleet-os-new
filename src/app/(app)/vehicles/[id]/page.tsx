import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireViewer, isAdmin } from '@/lib/auth';
import { getI18n, type I18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatEtb, formatKm, formatNumber, todayAddis } from '@/lib/format';
import type { Metric as MetricResult } from '@/lib/calc';
import {
  computeVehicleMetrics,
  mergeHistory,
  monthStart,
  reasonKey,
  windowFrom,
  type FinancialRow,
  type FuelRow,
  type ServiceRow,
  type TripExpenseRow,
} from '@/lib/vehicle-file';
import { Badge, Card, EmptyState, Flash, LinkButton, Metric, PageHeader, Section, StatusBadge } from '@/components/ui';
import { row, rows } from '@/components/home/query';
import { VehicleForm } from '../vehicle-form';

type DocRow = {
  id: string;
  document_type: string;
  expires_on: string | null;
  status: string;
  superseded?: boolean | null;
};
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function VehicleFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SP;
}) {
  const { profile } = await requireViewer();
  const admin = isAdmin(profile);
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const i18n = await getI18n();
  const { t, label, locale } = i18n;
  const supabase = await createClient();
  const today = todayAddis();
  const from = windowFrom(today);
  const monthFrom = monthStart(today);

  const [vehicleR, driversR, openTripR, recentTripsR, monthTripsR, fuelWinR, fuelRecentR, svcWinR, svcRecentR, eligibleR, vdocsR, incR] =
    await Promise.all([
      supabase
        .from('vehicles')
        .select('id, name, plate_number, make, model, year, status, current_odometer, notes')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('drivers').select('id, name'),
      supabase
        .from('trips')
        .select('id, driver_id, trip_date, origin, destination')
        .eq('vehicle_id', id)
        .eq('status', 'IN_PROGRESS')
        .is('voided_at', null)
        .order('trip_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('v_trip_financials')
        .select('trip_id, driver_id, trip_date, origin, destination, status, revenue, expenses, has_revenue, profit')
        .eq('vehicle_id', id)
        .order('trip_date', { ascending: false })
        .limit(40),
      supabase
        .from('v_trip_financials')
        .select('trip_id, driver_id, trip_date, origin, destination, status, revenue, expenses, has_revenue, profit')
        .eq('vehicle_id', id)
        .gte('trip_date', monthFrom),
      supabase
        .from('fuel_records')
        .select('id, fuel_date, quantity, unit_price, total_amount, amount_mismatch, odometer')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .gte('fuel_date', from),
      supabase
        .from('fuel_records')
        .select('id, fuel_date, quantity, unit_price, total_amount, amount_mismatch, odometer')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .order('fuel_date', { ascending: false })
        .limit(15),
      supabase
        .from('service_records')
        .select('id, service_date, category, cost, odometer')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .gte('service_date', from),
      supabase
        .from('service_records')
        .select('id, service_date, category, cost, odometer')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .order('service_date', { ascending: false })
        .limit(15),
      // Trips whose expenses count toward cost per km: not voided, not cancelled.
      supabase
        .from('trips')
        .select('id')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .neq('status', 'CANCELLED')
        .order('trip_date', { ascending: false })
        .limit(150),
      supabase
        .from('v_vehicle_documents')
        .select('id, document_type, expires_on, status, superseded')
        .eq('vehicle_id', id)
        .order('expires_on', { ascending: true, nullsFirst: false }),
      supabase
        .from('incidents')
        .select('id, title, status, occurred_at')
        .eq('vehicle_id', id)
        .is('voided_at', null)
        .order('occurred_at', { ascending: false })
        .limit(10),
    ]);

  const vehicle = row<{
    id: string;
    name: string;
    plate_number: string;
    make: string | null;
    model: string | null;
    year: number | null;
    status: string;
    current_odometer: number | string | null;
    notes: string | null;
  }>(vehicleR);
  if (!vehicle) notFound();

  type Fin = FinancialRow & { driver_id: string };
  const drivers = new Map(rows<{ id: string; name: string }>(driversR).map((d) => [d.id, d.name]));
  const openTrip = rows<{ id: string; driver_id: string; trip_date: string; origin: string; destination: string }>(
    openTripR,
  )[0];
  const recentTrips = rows<Fin>(recentTripsR);
  const monthTrips = rows<Fin>(monthTripsR);
  const fuel = dedupe(rows<FuelRow & { id: string }>(fuelWinR), rows<FuelRow & { id: string }>(fuelRecentR));
  const service = dedupe(rows<ServiceRow & { id: string }>(svcWinR), rows<ServiceRow & { id: string }>(svcRecentR));
  const eligibleTripIds = rows<{ id: string }>(eligibleR).map((x) => x.id);
  const vdocs = rows<DocRow>(vdocsR);
  const incidents = rows<{ id: string; title: string; status: string; occurred_at: string }>(incR);

  // Current driver = driver of the open trip; documents follow the current, else the latest, driver.
  const currentDriverId = openTrip?.driver_id;
  const docDriverId = currentDriverId ?? recentTrips[0]?.driver_id;
  const docDriverName = docDriverId ? drivers.get(docDriverId) : undefined;
  const [expR, ddocsR] = await Promise.all([
    eligibleTripIds.length
      ? supabase
          .from('trip_expenses')
          .select('trip_id, category, amount, expense_date')
          .eq('vehicle_id', id)
          .in('trip_id', eligibleTripIds)
          .is('voided_at', null)
          .gte('expense_date', from)
      : Promise.resolve({ data: [], error: null }),
    docDriverId
      ? supabase
          .from('v_driver_documents')
          .select('id, document_type, expires_on, status, superseded')
          .eq('driver_id', docDriverId)
          .order('expires_on', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const expenses = rows<TripExpenseRow>(expR);
  const ddocs = rows<DocRow>(ddocsR);

  const metrics = computeVehicleMetrics({ today, fuel, service, tripExpenses: expenses, financials: monthTrips, eligibleTripIds });
  const history = mergeHistory({ fuel, service, trips: recentTrips });
  const odo = vehicle.current_odometer == null ? null : Number(vehicle.current_odometer);
  const makeModel = [vehicle.make, vehicle.model, vehicle.year].filter((x) => x != null && x !== '').join(' ');

  const vq = `?vehicle=${vehicle.id}`;

  return (
    <div>
      <Link href="/vehicles" className="mb-2 inline-flex min-h-12 items-center text-base font-semibold text-brand-ink">
        {t('vehicles.backToList')}
      </Link>
      <Flash saved={sp.saved} error={sp.error} warn={sp.warn} />
      <PageHeader
        title={vehicle.name}
        subtitle={[vehicle.plate_number, makeModel].filter(Boolean).join(' · ')}
        actions={<StatusBadge group="vehicleStatus" code={vehicle.status} />}
      />
      <dl className="mb-4 space-y-1 text-base">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('vehicles.currentDriver')}</dt>
          <dd>{currentDriverId ? (drivers.get(currentDriverId) ?? t('common.unknown')) : t('common.unknown')}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('vehicles.odometer')}</dt>
          <dd className="tabular-nums">{odo == null ? t('common.unknown') : formatKm(odo, locale)}</dd>
        </div>
      </dl>

      {admin ? (
        <details className="mb-6 rounded-2xl border border-line bg-surface p-4">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
            {t('vehicles.editVehicle')}
          </summary>
          <div className="mt-3">
            <VehicleForm
              vehicle={{
                id: vehicle.id,
                name: vehicle.name,
                plate_number: vehicle.plate_number,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                current_odometer: vehicle.current_odometer,
                notes: vehicle.notes,
                status: vehicle.status,
                onTrip: Boolean(openTrip),
              }}
            />
          </div>
        </details>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3">
        <MetricCard
          i18n={i18n}
          title={`${t('vehicles.costPerKm')} (${t('vehicles.metricsTitle')})`}
          metric={metrics.costPerKm}
          format={(v) => t('vehicles.costPerKmValue', { amount: formatEtb(Math.round(v), locale) })}
          okHint={
            t('vehicles.costPerKmHint') +
            (metrics.costPerKm.status === 'ok' && (metrics.costPerKm.excluded ?? 0) > 0
              ? ' ' + t('vehicles.excludedServices', { n: metrics.costPerKm.excluded ?? 0 })
              : '')
          }
        />
        <MetricCard
          i18n={i18n}
          title={`${t('vehicles.fuelEfficiency')} (${t('vehicles.metricsTitle')})`}
          metric={metrics.fuelEfficiency}
          format={(v) => t('vehicles.kmPerL', { n: formatNumber(v, locale, 1) })}
          okHint={t('vehicles.fuelEfficiencyHint')}
        />
        <MetricCard
          i18n={i18n}
          title={t('vehicles.profitMonth')}
          metric={metrics.monthProfit}
          format={(v) => formatEtb(v, locale)}
          okHint={
            metrics.monthProfit.status === 'ok' && (metrics.monthProfit.excluded ?? 0) > 0
              ? t('vehicles.excludedTrips', { n: metrics.monthProfit.excluded ?? 0 })
              : undefined
          }
        />
      </div>

      <Section title={t('vehicles.currentTrip')}>
        {openTrip ? (
          <Card>
            <p className="text-lg font-semibold">
              {openTrip.origin} → {openTrip.destination}
            </p>
            <p className="mt-1 text-base text-muted">
              {drivers.get(openTrip.driver_id) ?? t('common.unknown')} · {t('vehicles.tripFrom', { date: formatDate(openTrip.trip_date, locale) })}
            </p>
          </Card>
        ) : (
          <EmptyState title={t('vehicles.noOpenTrip')} />
        )}
      </Section>

      <Section title={t('vehicles.historyTitle')}>
        {history.length === 0 ? (
          <EmptyState title={t('vehicles.historyEmpty')} />
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.kind + h.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="gray">{t(`vehicles.kind.${h.kind}`)}</Badge>
                    <span className="text-sm text-muted">{formatDate(h.date, locale)}</span>
                  </div>
                  {h.kind === 'fuel' ? (
                    <>
                      <p className="mt-2 text-base tabular-nums">
                        {t('vehicles.fuelLine', {
                          liters: h.liters == null ? t('common.unknown') : formatNumber(h.liters, locale, 2),
                          total: formatEtb(h.totalCents, locale),
                        })}
                      </p>
                      {h.mismatch ? <p className="mt-1 text-sm text-muted">{t('vehicles.mismatchNote')}</p> : null}
                    </>
                  ) : null}
                  {h.kind === 'service' ? (
                    <p className="mt-2 text-base">
                      {label('serviceCategory', h.category)}
                      {' · '}
                      {h.costCents == null ? t('common.unknown') : formatEtb(h.costCents, locale)}
                    </p>
                  ) : null}
                  {h.kind === 'trip' ? (
                    <p className="mt-2 text-base">
                      {h.origin} → {h.destination}
                      {' · '}
                      {t('vehicles.profit')}:{' '}
                      {h.profitCents == null ? t('common.insufficientData') : formatEtb(h.profitCents, locale)}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('vehicles.documentsTitle')}
        action={
          <Link href="/documents?tab=vehicle" className="inline-flex min-h-12 items-center text-base font-semibold text-brand-ink">
            {t('vehicles.manageDocs')}
          </Link>
        }
      >
        <DocList i18n={i18n} title={t('vehicles.vehicleDocs')} docs={vdocs} />
        {docDriverId ? (
          <DocList
            i18n={i18n}
            title={t('vehicles.driverDocs', { driver: docDriverName ?? t('common.unknown') })}
            docs={ddocs}
          />
        ) : null}
      </Section>

      <Section title={t('vehicles.linksTitle')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LinkButton href={`/expenses${vq}`} variant="secondary">
            {t('vehicles.expensesLink')}
          </LinkButton>
          <LinkButton href={`/maintenance${vq}`} variant="secondary">
            {t('vehicles.maintenanceLink')}
          </LinkButton>
          <LinkButton href={`/new/fuel${vq}`} variant="secondary">
            {t('vehicles.recordFuel')}
          </LinkButton>
        </div>
      </Section>

      <Section
        title={t('vehicles.incidentsTitle')}
        action={
          <Link href={`/new/incident${vq}`} className="inline-flex min-h-12 items-center text-base font-semibold text-brand-ink">
            {t('vehicles.reportIncident')}
          </Link>
        }
      >
        {incidents.length === 0 ? (
          <EmptyState title={t('vehicles.noIncidents')} />
        ) : (
          <ul className="space-y-2">
            {incidents.map((i) => (
              <li key={i.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-base font-semibold">{i.title}</p>
                    <StatusBadge group="incidentStatus" code={i.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{formatDate(i.occurred_at, locale)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function dedupe<T extends { id: string }>(a: T[], b: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of [...a, ...b]) seen.set(r.id, r);
  return [...seen.values()];
}

function MetricCard({
  i18n,
  title,
  metric,
  format,
  okHint,
}: {
  i18n: I18n;
  title: string;
  metric: MetricResult;
  format: (value: number) => string;
  okHint?: string;
}) {
  const { t } = i18n;
  if (metric.status === 'ok') {
    return <Metric label={title} value={format(metric.value)} hint={okHint} />;
  }
  return (
    <Metric
      label={title}
      value={<span className="text-xl">{t('common.insufficientData')}</span>}
      hint={t(`vehicles.reason.${reasonKey(metric.reason)}`)}
    />
  );
}

function DocList({ i18n, title, docs }: { i18n: I18n; title: string; docs: DocRow[] }) {
  const { t, label, locale } = i18n;
  // Replaced documents never drive status emphasis: they are listed last and muted.
  const ordered = [...docs.filter((d) => !d.superseded), ...docs.filter((d) => d.superseded)];
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-base font-semibold text-muted">{title}</h3>
      {ordered.length === 0 ? (
        <EmptyState title={t('vehicles.noDocs')} />
      ) : (
        <ul className="space-y-2">
          {ordered.map((d) => (
            <li key={d.id}>
              <Card className={d.superseded ? 'bg-muted-soft' : ''}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`min-w-0 text-base font-semibold ${d.superseded ? 'text-muted' : ''}`}>
                    {label('documentType', d.document_type)}
                  </p>
                  {d.superseded ? (
                    <Badge tone="gray">{t('vehicles.replacedBadge')}</Badge>
                  ) : (
                    <StatusBadge group="docStatus" code={d.status} />
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {d.expires_on ? t('vehicles.expires', { date: formatDate(d.expires_on, locale) }) : t('vehicles.noExpiry')}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
