import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatEtb } from '@/lib/format';
import { toCents } from '@/lib/money';
import { allowedTransitions, isTripStatus, TRIP_STATUSES } from '@/lib/trip-rules';
import { Card, Chips, EmptyState, Flash, LinkButton, PageHeader, StatusBadge } from '@/components/ui';
import { rows } from '@/components/home/query';
import { setTripStatus } from './actions';
import { StatusButton } from './status-button';

type SP = Promise<Record<string, string | string[] | undefined>>;

type TripRow = {
  trip_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_date: string;
  origin: string;
  destination: string;
  status: string;
  revenue: number | string | null;
  expenses: number | string | null;
  has_expenses: boolean;
  profit: number | string | null;
};

const TRIP_LIMIT = 50;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TripsPage({ searchParams }: { searchParams: SP }) {
  await requireViewer();
  const sp = await searchParams;
  const { t, label, locale } = await getI18n();

  const statusParam = first(sp.status);
  const status = isTripStatus(statusParam) ? statusParam : 'all';

  const supabase = await createClient();
  let q = supabase
    .from('v_trip_financials')
    .select('trip_id, vehicle_id, driver_id, trip_date, origin, destination, status, revenue, expenses, has_expenses, profit')
    .order('trip_date', { ascending: false })
    .limit(TRIP_LIMIT);
  if (status !== 'all') q = q.eq('status', status);

  const [tripsRes, vehiclesRes, driversRes] = await Promise.all([
    q,
    supabase.from('vehicles').select('id, name, plate_number'),
    supabase.from('drivers').select('id, name'),
  ]);

  const vehicles = new Map(rows<{ id: string; name: string; plate_number: string }>(vehiclesRes).map((v) => [v.id, v]));
  const drivers = new Map(rows<{ id: string; name: string }>(driversRes).map((d) => [d.id, d]));
  const trips = rows<TripRow>(tripsRes);

  const chips = ['all', ...TRIP_STATUSES].map((s) => ({
    href: s === 'all' ? '/trips' : `/trips?status=${s}`,
    label: s === 'all' ? t('trips.filterAll') : label('tripStatus', s),
    active: s === status,
  }));

  return (
    <div>
      <PageHeader
        title={t('trips.title')}
        actions={<LinkButton href="/new/trip">{t('trips.add')}</LinkButton>}
      />
      <Flash saved={sp.saved} error={sp.error} warn={sp.warn} />
      <Chips items={chips} />

      {trips.length === 0 ? (
        <EmptyState
          title={t('trips.empty')}
          hint={t('trips.emptyHint')}
          action={<LinkButton href="/new/trip">{t('trips.add')}</LinkButton>}
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const v = vehicles.get(trip.vehicle_id);
            const d = drivers.get(trip.driver_id);
            const revenueCents = toCents(trip.revenue);
            const expenseCents = toCents(trip.expenses) ?? 0;
            const profitCents = toCents(trip.profit);
            const next = allowedTransitions(trip.status);
            return (
              <li key={trip.trip_id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-muted">{formatDate(trip.trip_date, locale)}</p>
                      <p className="text-lg font-semibold leading-snug">
                        {trip.origin} → {trip.destination}
                      </p>
                      <p className="text-base">
                        {v ? `${v.name} · ${v.plate_number}` : t('trips.unknownVehicle')}
                      </p>
                      <p className="text-base text-muted">{d ? d.name : t('trips.unknownDriver')}</p>
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
                        {trip.has_expenses ? formatEtb(expenseCents, locale) : (
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
                  {profitCents == null ? (
                    <p className="mt-2 text-sm text-muted">{t('trips.profitUnknown')}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/expenses?trip=${trip.trip_id}`}
                      className="inline-flex min-h-12 items-center rounded-xl border border-line px-4 text-base font-semibold hover:bg-muted-soft"
                    >
                      {t('trips.viewExpenses')}
                    </Link>
                    {next.includes('IN_PROGRESS') ? (
                      <StatusForm id={trip.trip_id} to="IN_PROGRESS">
                        <StatusButton>{t('trips.start')}</StatusButton>
                      </StatusForm>
                    ) : null}
                    {next.includes('COMPLETED') ? (
                      <ConfirmStep
                        summary={t('trips.complete')}
                        question={t('trips.confirmComplete')}
                        primary
                      >
                        <StatusForm id={trip.trip_id} to="COMPLETED">
                          <StatusButton>{t('trips.confirmYesComplete')}</StatusButton>
                        </StatusForm>
                      </ConfirmStep>
                    ) : null}
                  </div>
                  {next.includes('CANCELLED') ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <ConfirmStep summary={t('trips.cancel')} question={t('trips.confirmCancel')}>
                        <StatusForm id={trip.trip_id} to="CANCELLED">
                          <StatusButton variant="danger">{t('trips.confirmYesCancel')}</StatusButton>
                        </StatusForm>
                      </ConfirmStep>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {trips.length >= TRIP_LIMIT ? (
        <p className="mt-4 text-sm text-muted">{t('trips.limitNote', { n: TRIP_LIMIT })}</p>
      ) : null}
    </div>
  );
}

function StatusForm({ id, to, children }: { id: string; to: string; children: ReactNode }) {
  return (
    <form action={setTripStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="back" value="/trips" />
      {children}
    </form>
  );
}

/** Two-step confirmation: opening the summary reveals the question and the real submit button. */
function ConfirmStep({
  summary,
  question,
  primary = false,
  children,
}: {
  summary: string;
  question: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={`inline-flex min-h-12 cursor-pointer list-none items-center rounded-xl px-4 text-base font-semibold leading-snug [&::-webkit-details-marker]:hidden ${
          primary ? 'bg-brand text-on-brand hover:bg-brand-strong' : 'border border-line text-bad-ink hover:bg-muted-soft'
        }`}
      >
        {summary}
      </summary>
      <div className="mt-2 rounded-xl bg-warn-soft p-3">
        <p className="mb-3 text-base font-medium text-warn-ink">{question}</p>
        {children}
      </div>
    </details>
  );
}
