import Link from 'next/link';
import { isAdmin, requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatEtb, todayAddis } from '@/lib/format';
import { toCents } from '@/lib/money';
import { Card, EmptyState, Flash, LinkButton, PageHeader, Section, StatusBadge } from '@/components/ui';
import { VoidForm } from '@/components/forms-core';
import { ExpenseForm, RevenueForm } from './expense-form';

type SP = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type TripRow = {
  trip_id: string;
  vehicle_id: string;
  trip_date: string;
  origin: string;
  destination: string;
  status: string;
  revenue: number | string | null;
  expenses: number | string | null;
  has_expenses: boolean;
  profit: number | string | null;
};
type ExpenseRow = {
  id: string;
  trip_id: string;
  category: string;
  description: string | null;
  amount: number | string;
  expense_date: string;
  created_at: string;
};
type RevenueRow = {
  id: string;
  trip_id: string;
  description: string | null;
  amount: number | string;
  revenue_date: string;
  created_at: string;
};

export default async function ExpensesPage({ searchParams }: { searchParams: SP }) {
  const { profile } = await requireViewer();
  const sp = await searchParams;
  const { t, label, locale } = await getI18n();
  const admin = isAdmin(profile);
  const today = todayAddis();

  const tripParam = first(sp.trip);
  const vehicleParam = first(sp.vehicle);
  const tripFilter = tripParam && UUID.test(tripParam) ? tripParam : undefined;
  const vehicleFilter = !tripFilter && vehicleParam && UUID.test(vehicleParam) ? vehicleParam : undefined;

  const supabase = await createClient();
  let q = supabase
    .from('v_trip_financials')
    .select('trip_id, vehicle_id, trip_date, origin, destination, status, revenue, expenses, has_expenses, profit')
    .order('trip_date', { ascending: false });
  if (tripFilter) q = q.eq('trip_id', tripFilter).limit(1);
  else if (vehicleFilter) q = q.eq('vehicle_id', vehicleFilter).limit(30);
  else q = q.limit(30);

  const [tripsRes, vehiclesRes] = await Promise.all([
    q,
    supabase.from('vehicles').select('id, name, plate_number'),
  ]);
  const trips = (tripsRes.data ?? []) as TripRow[];
  const vehicles = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v]));
  const ids = trips.map((x) => x.trip_id);

  const [expRes, revRes] = ids.length
    ? await Promise.all([
        supabase
          .from('trip_expenses')
          .select('id, trip_id, category, description, amount, expense_date, created_at')
          .in('trip_id', ids)
          .is('voided_at', null)
          .order('expense_date', { ascending: false }),
        supabase
          .from('trip_revenue')
          .select('id, trip_id, description, amount, revenue_date, created_at')
          .in('trip_id', ids)
          .is('voided_at', null)
          .order('revenue_date', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const expByTrip = new Map<string, ExpenseRow[]>();
  for (const e of (expRes.data ?? []) as ExpenseRow[]) {
    const list = expByTrip.get(e.trip_id) ?? [];
    list.push(e);
    expByTrip.set(e.trip_id, list);
  }
  const revByTrip = new Map<string, RevenueRow[]>();
  for (const r of (revRes.data ?? []) as RevenueRow[]) {
    const list = revByTrip.get(r.trip_id) ?? [];
    list.push(r);
    revByTrip.set(r.trip_id, list);
  }

  const tripOptions = trips.map((x) => {
    const v = vehicles.get(x.vehicle_id);
    return {
      value: x.trip_id,
      label: `${formatDate(x.trip_date, locale)} · ${x.origin} → ${x.destination}${v ? ` · ${v.plate_number}` : ''}`,
    };
  });

  const filtered = Boolean(tripFilter || vehicleFilter);
  const returnTo = tripFilter
    ? `/expenses?trip=${tripFilter}`
    : vehicleFilter
      ? `/expenses?vehicle=${vehicleFilter}`
      : '/expenses';

  return (
    <div>
      <PageHeader title={t('expenses.title')} />
      <Flash saved={sp.saved} error={sp.error} />

      {trips.length > 0 ? (
        <details open={Boolean(tripFilter)} className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">
            {t('expenses.add')}
          </summary>
          <div className="mt-3">
            <ExpenseForm trips={tripOptions} defaultTrip={tripFilter} today={today} />
          </div>
        </details>
      ) : null}

      {filtered ? (
        <p className="mb-4 text-base text-muted">
          {t('expenses.filteredNote')}{' '}
          <Link href="/expenses" className="font-semibold text-brand-ink underline">
            {t('expenses.clearFilter')}
          </Link>
        </p>
      ) : null}

      {trips.length === 0 ? (
        <EmptyState
          title={t('expenses.empty')}
          hint={t('expenses.emptyHint')}
          action={<LinkButton href="/new/trip">{t('trips.add')}</LinkButton>}
        />
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => {
            const v = vehicles.get(trip.vehicle_id);
            const revenueCents = toCents(trip.revenue);
            const profitCents = toCents(trip.profit);
            const exps = expByTrip.get(trip.trip_id) ?? [];
            const revs = revByTrip.get(trip.trip_id) ?? [];
            return (
              <Card key={trip.trip_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">{formatDate(trip.trip_date, locale)}</p>
                    <h2 className="text-lg font-semibold leading-snug">
                      {trip.origin} → {trip.destination}
                    </h2>
                    <p className="text-base text-muted">
                      {v ? `${v.name} · ${v.plate_number}` : t('trips.unknownVehicle')}
                    </p>
                  </div>
                  <StatusBadge group="tripStatus" code={trip.status} />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-base">
                  <div>
                    <dt className="text-sm text-muted">{t('trips.revenue')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {revenueCents == null ? (
                        <span className="text-sm font-normal text-muted">{t('trips.revenueMissing')}</span>
                      ) : (
                        formatEtb(revenueCents, locale)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('trips.expenses')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {trip.has_expenses ? (
                        formatEtb(toCents(trip.expenses) ?? 0, locale)
                      ) : (
                        <span className="text-sm font-normal text-muted">{t('trips.noExpenses')}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('trips.profit')}</dt>
                    <dd className="font-semibold tabular-nums">
                      {profitCents == null ? (
                        <span className="text-sm font-normal text-muted">{t('common.insufficientData')}</span>
                      ) : (
                        formatEtb(profitCents, locale)
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <Section title={t('expenses.expenseLines')}>
                    {exps.length === 0 ? (
                      <p className="text-base text-muted">{t('expenses.noLines')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {exps.map((e) => (
                          <li key={e.id} className="rounded-xl border border-line p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-base font-medium">{label('expenseCategory', e.category)}</p>
                                {e.description ? <p className="text-base text-muted">{e.description}</p> : null}
                                <p className="text-sm text-muted">
                                  {formatDate(e.expense_date, locale)} ·{' '}
                                  {t('expenses.recordedOn', { date: formatDate(e.created_at, locale) })}
                                </p>
                              </div>
                              <p className="shrink-0 text-base font-semibold tabular-nums">
                                {formatEtb(toCents(e.amount), locale)}
                              </p>
                            </div>
                            {admin ? (
                              <div className="mt-2">
                                <VoidForm table="trip_expenses" id={e.id} returnTo={returnTo} />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title={t('expenses.revenueLines')}>
                    {revs.length === 0 ? (
                      <p className="text-base text-muted">{t('expenses.noLines')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {revs.map((r) => (
                          <li key={r.id} className="rounded-xl border border-line p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {r.description ? <p className="text-base">{r.description}</p> : null}
                                <p className="text-sm text-muted">
                                  {formatDate(r.revenue_date, locale)} ·{' '}
                                  {t('expenses.recordedOn', { date: formatDate(r.created_at, locale) })}
                                </p>
                              </div>
                              <p className="shrink-0 text-base font-semibold tabular-nums">
                                {formatEtb(toCents(r.amount), locale)}
                              </p>
                            </div>
                            {admin ? (
                              <div className="mt-2">
                                <VoidForm table="trip_revenue" id={r.id} returnTo={returnTo} />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <RevenueForm tripId={trip.trip_id} today={today} />
                  </Section>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
