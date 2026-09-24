import { requireViewer } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatEtb, formatMonth, todayAddis } from '@/lib/format';
import { toCents } from '@/lib/money';
import { Card, EmptyState, PageHeader, Section } from '@/components/ui';
import { rows } from '@/components/home/query';

type SP = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** 'YYYY-MM' -> ['YYYY-MM-01', 'YYYY-MM-01' of the following month) as plain date strings. */
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return [start, end];
}

/** Last `n` months including the current one, oldest first, as 'YYYY-MM'. */
function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').slice(0, 2).map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    out.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return out;
}

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  await requireViewer();
  const sp = await searchParams;
  const { t, label, locale } = await getI18n();
  const supabase = await createClient();
  const today = todayAddis();

  const vehicleParam = first(sp.vehicle);
  const vehicle = vehicleParam && UUID.test(vehicleParam) ? vehicleParam : undefined;
  const monthParam = first(sp.month);
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : undefined;
  const monthsWindow = Math.min(24, Math.max(1, Number(first(sp.months) ?? '6') | 0 || 6));

  const vehiclesRes = await supabase.from('vehicles').select('id, name, plate_number').order('name');
  const vehicles = rows<{ id: string; name: string; plate_number: string }>(vehiclesRes);

  // ---------------------------------------------------------------- P&L
  let pnl: {
    revenueCents: number;
    expenseCents: number;
    profitCents: number;
    hasRevenue: boolean;
    byCategory: { category: string; cents: number }[];
  } | null = null;

  if (vehicle && month) {
    const [start, end] = monthRange(month);
    const tripsForMonth = await supabase
      .from('trips')
      .select('id')
      .eq('vehicle_id', vehicle)
      .gte('trip_date', start)
      .lt('trip_date', end)
      .is('voided_at', null);
    const tripIds = rows<{ id: string }>(tripsForMonth).map((r) => r.id);

    if (tripIds.length > 0) {
      const [revRes, expRes] = await Promise.all([
        supabase.from('trip_revenue').select('amount').in('trip_id', tripIds).is('voided_at', null),
        supabase.from('trip_expenses').select('amount, category').in('trip_id', tripIds).is('voided_at', null),
      ]);
      const revRows = rows<{ amount: number | string }>(revRes);
      const expRows = rows<{ amount: number | string; category: string }>(expRes);
      const revenueCents = revRows.reduce((sum, r) => sum + (toCents(r.amount) ?? 0), 0);
      const expenseCents = expRows.reduce((sum, r) => sum + (toCents(r.amount) ?? 0), 0);
      const byCategoryMap = new Map<string, number>();
      for (const r of expRows) {
        byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + (toCents(r.amount) ?? 0));
      }
      pnl = {
        revenueCents,
        expenseCents,
        profitCents: revenueCents - expenseCents,
        hasRevenue: revRows.length > 0,
        byCategory: [...byCategoryMap.entries()].map(([category, cents]) => ({ category, cents })),
      };
    } else {
      pnl = { revenueCents: 0, expenseCents: 0, profitCents: 0, hasRevenue: false, byCategory: [] };
    }
  }

  // ---------------------------------------------------------------- fleet-wide cost trend
  const months = lastMonths(today, monthsWindow);
  const [trendStart] = monthRange(months[0]);
  const [tripExpRes, svcRes] = await Promise.all([
    supabase.from('trip_expenses').select('amount, expense_date').gte('expense_date', trendStart).is('voided_at', null),
    supabase
      .from('service_records')
      .select('cost, service_date')
      .gte('service_date', trendStart)
      .not('cost', 'is', null)
      .is('voided_at', null),
  ]);
  const tripByMonth = new Map<string, number>();
  for (const r of rows<{ amount: number | string; expense_date: string }>(tripExpRes)) {
    const ym = r.expense_date.slice(0, 7);
    tripByMonth.set(ym, (tripByMonth.get(ym) ?? 0) + (toCents(r.amount) ?? 0));
  }
  const svcByMonth = new Map<string, number>();
  for (const r of rows<{ cost: number | string; service_date: string }>(svcRes)) {
    const ym = r.service_date.slice(0, 7);
    svcByMonth.set(ym, (svcByMonth.get(ym) ?? 0) + (toCents(r.cost) ?? 0));
  }
  const trend = months.map((ym) => {
    const tripCents = tripByMonth.get(ym) ?? 0;
    const svcCents = svcByMonth.get(ym) ?? 0;
    return { ym, tripCents, svcCents, totalCents: tripCents + svcCents };
  });

  return (
    <div>
      <PageHeader title={t('reports.title')} />

      <Section title={t('reports.pnlTitle')}>
        <Card className="mb-4">
          <form method="get" action="/reports" className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="pnl-vehicle" className="mb-1 block text-base font-medium">{t('reports.pnlVehicle')}</label>
              <select
                id="pnl-vehicle"
                name="vehicle"
                defaultValue={vehicle ?? ''}
                className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
              >
                <option value="">{t('reports.pnlChoose')}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {v.plate_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pnl-month" className="mb-1 block text-base font-medium">{t('reports.pnlMonth')}</label>
              <input
                id="pnl-month"
                type="month"
                name="month"
                defaultValue={month ?? ''}
                className="block min-h-12 rounded-xl border border-line bg-surface px-4 py-2 text-base"
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft"
            >
              {t('reports.pnlApply')}
            </button>
          </form>
        </Card>

        {!pnl ? (
          <EmptyState title={t('reports.pnlPickBoth')} />
        ) : (
          <Card>
            <dl className="grid grid-cols-1 gap-3 text-base sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted">{t('trips.revenue')}</dt>
                <dd className="font-semibold tabular-nums">
                  {pnl.hasRevenue ? formatEtb(pnl.revenueCents, locale) : (
                    <span className="text-sm font-normal text-muted">{t('trips.revenueMissing')}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">{t('trips.expenses')}</dt>
                <dd className="font-semibold tabular-nums">{formatEtb(pnl.expenseCents, locale)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">{t('trips.profit')}</dt>
                <dd className="font-semibold tabular-nums">
                  {pnl.hasRevenue ? formatEtb(pnl.profitCents, locale) : (
                    <span className="text-sm font-normal text-muted">{t('common.insufficientData')}</span>
                  )}
                </dd>
              </div>
            </dl>
            {pnl.byCategory.length > 0 ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-sm font-semibold text-muted">{t('reports.pnlByCategory')}</p>
                <ul className="space-y-1 text-base">
                  {pnl.byCategory.map((c) => (
                    <li key={c.category} className="flex justify-between gap-3">
                      <span>{label('expenseCategory', c.category)}</span>
                      <span className="tabular-nums">{formatEtb(c.cents, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {pnl.revenueCents === 0 && pnl.expenseCents === 0 && !pnl.hasRevenue && pnl.byCategory.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('reports.pnlNoData')}</p>
            ) : null}
          </Card>
        )}
      </Section>

      <Section title={t('reports.trendTitle')}>
        <p className="mb-3 text-sm text-muted">{t('reports.trendNote', { n: monthsWindow })}</p>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-base">
              <thead>
                <tr className="border-b border-line text-left text-sm text-muted">
                  <th className="py-2 pr-3 font-medium">{t('reports.trendMonth')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('reports.trendTripCosts')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('reports.trendServiceCosts')}</th>
                  <th className="py-2 text-right font-medium">{t('reports.trendTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((row) => (
                  <tr key={row.ym} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{formatMonth(row.ym, locale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatEtb(row.tripCents, locale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatEtb(row.svcCents, locale)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatEtb(row.totalCents, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>
    </div>
  );
}
