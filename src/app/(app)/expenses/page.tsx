import Link from 'next/link';
import { isAdmin, requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatEtb, todayAddis } from '@/lib/format';
import { toCents } from '@/lib/money';
import { Card, EmptyState, Flash, LinkButton, PageHeader, Pager, Section, StatusBadge } from '@/components/ui';
import { rows } from '@/components/home/query';
import { VoidForm } from '@/components/forms-core';
import { ExpenseForm, RevenueForm } from './expense-form';
import { CostsPdfButton, type PdfServiceRow, type PdfTripRow } from './costs-pdf-button';

type SP = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 15;
const SVC_PAGE_SIZE = 15;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const sanitizeSearch = (s: string) => s.replace(/[,()%]/g, ' ').trim();

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
type ServiceCostRow = {
  id: string;
  vehicle_id: string;
  service_date: string;
  category: string;
  cost: number | string | null;
  service_provider: string | null;
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
  const q = sanitizeSearch(first(sp.q) ?? '');
  const from = DATE_RE.test(first(sp.from) ?? '') ? first(sp.from)! : '';
  const to = DATE_RE.test(first(sp.to) ?? '') ? first(sp.to)! : '';
  const page = Math.max(1, Number(first(sp.page) ?? '1') | 0 || 1);
  const spage = Math.max(1, Number(first(sp.spage) ?? '1') | 0 || 1);

  const supabase = await createClient();
  let query = supabase
    .from('v_trip_financials')
    .select('trip_id, vehicle_id, trip_date, origin, destination, status, revenue, expenses, has_expenses, profit')
    .order('trip_date', { ascending: false });
  if (tripFilter) {
    query = query.eq('trip_id', tripFilter).limit(1);
  } else {
    if (vehicleFilter) query = query.eq('vehicle_id', vehicleFilter);
    if (from) query = query.gte('trip_date', from);
    if (to) query = query.lte('trip_date', to);
    if (q) query = query.or(`origin.ilike.%${q}%,destination.ilike.%${q}%`);
    const offset = (page - 1) * PAGE_SIZE;
    query = query.range(offset, offset + PAGE_SIZE);
  }

  let svcQuery = supabase
    .from('service_records')
    .select('id, vehicle_id, service_date, category, cost, service_provider')
    .is('voided_at', null)
    .not('cost', 'is', null)
    .order('service_date', { ascending: false });
  if (vehicleFilter) svcQuery = svcQuery.eq('vehicle_id', vehicleFilter);
  if (from) svcQuery = svcQuery.gte('service_date', from);
  if (to) svcQuery = svcQuery.lte('service_date', to);
  const svcOffset = (spage - 1) * SVC_PAGE_SIZE;
  svcQuery = svcQuery.range(svcOffset, svcOffset + SVC_PAGE_SIZE);

  const [tripsRes, vehiclesRes, svcRes] = await Promise.all([
    query,
    supabase.from('vehicles').select('id, name, plate_number'),
    tripFilter ? Promise.resolve({ data: [], error: null }) : svcQuery,
  ]);
  const rawTrips = rows<TripRow>(tripsRes);
  const hasMoreTrips = !tripFilter && rawTrips.length > PAGE_SIZE;
  const trips = hasMoreTrips ? rawTrips.slice(0, PAGE_SIZE) : rawTrips;
  const vehicles = new Map(rows<{ id: string; name: string; plate_number: string }>(vehiclesRes).map((v) => [v.id, v]));
  const rawServices = rows<ServiceCostRow>(svcRes);
  const hasMoreServices = rawServices.length > SVC_PAGE_SIZE;
  const services = hasMoreServices ? rawServices.slice(0, SVC_PAGE_SIZE) : rawServices;
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
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  const expByTrip = new Map<string, ExpenseRow[]>();
  for (const e of rows<ExpenseRow>(expRes)) {
    const list = expByTrip.get(e.trip_id) ?? [];
    list.push(e);
    expByTrip.set(e.trip_id, list);
  }
  const revByTrip = new Map<string, RevenueRow[]>();
  for (const r of rows<RevenueRow>(revRes)) {
    const list = revByTrip.get(r.trip_id) ?? [];
    list.push(r);
    revByTrip.set(r.trip_id, list);
  }

  const tripCostsCents = trips.reduce((sum, x) => sum + (x.has_expenses ? (toCents(x.expenses) ?? 0) : 0), 0);
  const serviceCostsCents = services.reduce((sum, r) => sum + (toCents(r.cost) ?? 0), 0);
  const totalCostsCents = tripCostsCents + serviceCostsCents;

  const tripOptions = trips.map((x) => {
    const v = vehicles.get(x.vehicle_id);
    return {
      value: x.trip_id,
      label: `${formatDate(x.trip_date, locale)} · ${x.origin} → ${x.destination}${v ? ` · ${v.plate_number}` : ''}`,
    };
  });

  const filtered = Boolean(tripFilter || vehicleFilter || q || from || to);
  const returnTo = tripFilter
    ? `/expenses?trip=${tripFilter}`
    : vehicleFilter
      ? `/expenses?vehicle=${vehicleFilter}`
      : '/expenses';

  const baseParams = (extra: Record<string, string>) => {
    const usp = new URLSearchParams();
    if (vehicleFilter) usp.set('vehicle', vehicleFilter);
    if (q) usp.set('q', q);
    if (from) usp.set('from', from);
    if (to) usp.set('to', to);
    for (const [k, v] of Object.entries(extra)) {
      if (v) usp.set(k, v);
      else usp.delete(k);
    }
    const s = usp.toString();
    return s ? `/expenses?${s}` : '/expenses';
  };

  // PDF export data, pre-formatted in the request locale.
  const pdfTrips: PdfTripRow[] = trips.map((trip) => {
    const v = vehicles.get(trip.vehicle_id);
    const revenueCents = toCents(trip.revenue);
    const profitCents = toCents(trip.profit);
    return {
      dateLabel: formatDate(trip.trip_date, locale),
      routeLabel: `${trip.origin} → ${trip.destination}`,
      vehicleLabel: v ? `${v.name} · ${v.plate_number}` : t('trips.unknownVehicle'),
      revenueLabel: revenueCents == null ? t('expenses.pdfNoRevenue') : formatEtb(revenueCents, locale),
      expenseLabel: trip.has_expenses ? formatEtb(toCents(trip.expenses) ?? 0, locale) : t('expenses.pdfNoExpense'),
      profitLabel: profitCents == null ? t('expenses.pdfNoProfit') : formatEtb(profitCents, locale),
    };
  });
  const pdfServices: PdfServiceRow[] = services.map((r) => {
    const v = vehicles.get(r.vehicle_id);
    return {
      dateLabel: formatDate(r.service_date, locale),
      categoryLabel: label('serviceCategory', r.category),
      vehicleLabel: v ? `${v.name} · ${v.plate_number}` : '',
      costLabel: formatEtb(toCents(r.cost) ?? 0, locale),
    };
  });

  return (
    <div>
      <PageHeader
        title={t('expenses.title')}
        actions={
          <>
          <LinkButton href="/reports" variant="secondary">{t('reports.title')}</LinkButton>
          <CostsPdfButton
            title={t('expenses.title')}
            generatedLabel={t('expenses.pdfGenerated', { date: formatDate(today, locale) })}
            tripSectionTitle={t('expenses.tripCostsSection')}
            serviceSectionTitle={t('expenses.serviceCostsSection')}
            summaryTripLabel={t('expenses.summaryTripCosts')}
            summaryServiceLabel={t('expenses.summaryServiceCosts')}
            summaryTotalLabel={t('expenses.summaryTotal')}
            summaryTripValue={formatEtb(tripCostsCents, locale)}
            summaryServiceValue={formatEtb(serviceCostsCents, locale)}
            summaryTotalValue={formatEtb(totalCostsCents, locale)}
            trips={pdfTrips}
            services={pdfServices}
            revenueWord={t('trips.revenue')}
            expenseWord={t('trips.expenses')}
            profitWord={t('trips.profit')}
            buttonLabel={t('expenses.downloadPdf')}
          />
          </>
        }
      />
      <Flash saved={sp.saved} error={sp.error} />

      <Card className="mb-4">
        <dl className="grid grid-cols-1 gap-2 text-base sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">{t('expenses.summaryTripCosts')}</dt>
            <dd className="font-semibold tabular-nums">{formatEtb(tripCostsCents, locale)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('expenses.summaryServiceCosts')}</dt>
            <dd className="font-semibold tabular-nums">{formatEtb(serviceCostsCents, locale)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('expenses.summaryTotal')}</dt>
            <dd className="font-semibold tabular-nums">{formatEtb(totalCostsCents, locale)}</dd>
          </div>
        </dl>
      </Card>

      {!tripFilter ? (
        <form method="get" action="/expenses" className="mb-4 flex flex-wrap items-end gap-2">
          {vehicleFilter ? <input type="hidden" name="vehicle" value={vehicleFilter} /> : null}
          <div className="min-w-0 flex-1">
            <label htmlFor="cost-q" className="mb-1 block text-base font-medium">{t('common.search')}</label>
            <input
              id="cost-q"
              type="text"
              name="q"
              defaultValue={q}
              placeholder={t('common.searchPlaceholder')}
              className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
            />
          </div>
          <div>
            <label htmlFor="cost-from" className="mb-1 block text-base font-medium">{t('common.from')}</label>
            <input
              id="cost-from"
              type="date"
              name="from"
              defaultValue={from}
              className="block min-h-12 rounded-xl border border-line bg-surface px-4 py-2 text-base"
            />
          </div>
          <div>
            <label htmlFor="cost-to" className="mb-1 block text-base font-medium">{t('common.to')}</label>
            <input
              id="cost-to"
              type="date"
              name="to"
              defaultValue={to}
              className="block min-h-12 rounded-xl border border-line bg-surface px-4 py-2 text-base"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft"
          >
            {t('common.filter')}
          </button>
        </form>
      ) : null}

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
        <Section title={t('expenses.tripCostsSection')}>
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

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-base sm:grid-cols-3">
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
          {!tripFilter ? (
            <Pager
              page={page}
              hasMore={hasMoreTrips}
              prevHref={page > 1 ? baseParams({ page: page > 2 ? String(page - 1) : '' }) : null}
              nextHref={baseParams({ page: String(page + 1) })}
              prevLabel={t('common.previous')}
              nextLabel={t('common.next')}
              pageLabel={t('common.page', { n: page })}
            />
          ) : null}
        </Section>
      )}

      {!tripFilter ? (
        <Section title={t('expenses.serviceCostsSection')}>
          {services.length === 0 ? (
            <p className="text-base text-muted">{t('expenses.noServiceCosts')}</p>
          ) : (
            <div className="space-y-3">
              {services.map((r) => {
                const v = vehicles.get(r.vehicle_id);
                return (
                  <Card key={r.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-snug">{label('serviceCategory', r.category)}</p>
                        <p className="text-base text-muted">{v ? `${v.name} · ${v.plate_number}` : ''}</p>
                      </div>
                      <p className="shrink-0 text-base">{formatDate(r.service_date, locale)}</p>
                    </div>
                    <dl className="mt-2 space-y-1 text-base">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('maintenance.cost')}</dt>
                        <dd className="tabular-nums">{formatEtb(toCents(r.cost) ?? 0, locale)}</dd>
                      </div>
                      {r.service_provider ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">{t('maintenance.provider')}</dt>
                          <dd className="text-right">{r.service_provider}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {admin ? (
                      <div className="mt-3">
                        <VoidForm table="service_records" id={r.id} returnTo={returnTo} />
                      </div>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
          <Pager
            page={spage}
            hasMore={hasMoreServices}
            prevHref={spage > 1 ? baseParams({ spage: spage > 2 ? String(spage - 1) : '' }) : null}
            nextHref={baseParams({ spage: String(spage + 1) })}
            prevLabel={t('common.previous')}
            nextLabel={t('common.next')}
            pageLabel={t('common.page', { n: spage })}
          />
        </Section>
      ) : null}
    </div>
  );
}
