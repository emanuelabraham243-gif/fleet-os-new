import Link from 'next/link';
import { getI18n, type I18n } from '@/lib/i18n';
import { isAdmin, requireViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { daysBetween, formatDate, formatEtb, todayAddis } from '@/lib/format';
import { toCents } from '@/lib/money';
import { Badge, Card, Chips, EmptyState, Flash, PageHeader, type Tone } from '@/components/ui';
import { rows } from '@/components/home/query';
import { VoidForm } from '@/components/forms-core';
import {
  HOUSE_FILTERS, calcHouse, compareHouses, houseTotals, matchesFilter, matchesSearch,
  type House, type HouseCalc, type HouseFilter, type HousePaymentKind, type HousePlan, type HouseStatus, type PayState,
} from '@/lib/house-rules';
import { HouseForm, PaymentForm, type HouseFormValues } from './house-forms';
import { confirmHousePayment } from './actions';

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PATH = '/documents/houses';
const BACK = '/documents?tab=general&category=FAMILY';

type PropertyRow = {
  id: string; name: string; kind: string | null; location: string | null; house_no: string | null;
  ownership: string | null; price: string | null; price_confirmed: boolean; plan: HousePlan;
  rounds_total: number | null; round_amount: string | null; payments_complete: boolean;
  property_status: HouseStatus; hold_reason: string | null; next_due_on: string | null;
  next_amount: string | null; finishing_pending: boolean; finishing_amount: string | null;
  checks: string[] | null; notes: string | null; refs: string | null; sort_order: number;
};
type PaymentRow = {
  id: string; property_id: string; amount: string; paid_on: string | null; kind: HousePaymentKind;
  label: string | null; confirmed: boolean; note: string | null; created_at: string;
};

type Item = { p: PropertyRow; pays: PaymentRow[]; h: House; c: HouseCalc; order: number };

const STATE_TONE: Record<PayState, Tone> = { paid: 'green', partial: 'blue', unpaid: 'blue', unknown: 'gray' };
const plain = (v: string | number | null) => (v == null ? '' : String(Number(v)));

export default async function HousesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { profile } = await requireViewer();
  const i18n = await getI18n();
  const { t, locale } = i18n;

  const header = (
    <>
      <Link href={BACK} className="mb-2 inline-flex min-h-12 items-center text-base font-medium text-brand-ink hover:underline">
        ← {t('houses.back')}
      </Link>
      <PageHeader title={t('houses.title')} subtitle={t('houses.subtitle')} />
    </>
  );
  if (!isAdmin(profile)) {
    return (
      <div>
        {header}
        <p className="text-base text-muted">{t('houses.noPermission')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = todayAddis();
  const [propsRes, paysRes] = await Promise.all([
    supabase.from('house_properties').select('*').is('voided_at', null).order('sort_order'),
    supabase.from('house_payments').select('*').is('voided_at', null).order('created_at'),
  ]);
  const props = rows<PropertyRow>(propsRes);
  const pays = rows<PaymentRow>(paysRes);

  const items: Item[] = props.map((p) => {
    const mine = pays.filter((x) => x.property_id === p.id);
    const h: House = {
      name: p.name, kind: p.kind, location: p.location, houseNo: p.house_no, ownership: p.ownership,
      priceCents: toCents(p.price), priceConfirmed: p.price_confirmed, plan: p.plan, roundsTotal: p.rounds_total,
      paymentsComplete: p.payments_complete, propertyStatus: p.property_status, holdReason: p.hold_reason,
      nextDueOn: p.next_due_on, nextAmountCents: toCents(p.next_amount), finishingPending: p.finishing_pending,
      finishingAmountCents: toCents(p.finishing_amount), checks: p.checks ?? [],
      payments: mine.map((x) => ({ amountCents: toCents(x.amount) ?? 0, paidOn: x.paid_on, kind: x.kind, confirmed: x.confirmed })),
    };
    return { p, pays: mine, h, c: calcHouse(h, today), order: p.sort_order };
  });

  const filterParam = first(sp.f);
  const filter: HouseFilter = (HOUSE_FILTERS as readonly string[]).includes(filterParam ?? '') ? (filterParam as HouseFilter) : 'all';
  const q = (first(sp.q) ?? '').slice(0, 100);
  const list = items.filter((x) => matchesSearch(x.h, q) && matchesFilter(x.h, x.c, filter)).sort(compareHouses);
  const totals = houseTotals(items);
  const money = (cents: number | null) => formatEtb(cents, locale);

  const href = (f: HouseFilter) => {
    const usp = new URLSearchParams();
    if (f !== 'all') usp.set('f', f);
    if (q) usp.set('q', q);
    const s = usp.toString();
    return s ? `${PATH}?${s}` : PATH;
  };
  const chips = HOUSE_FILTERS.map((f) => ({ href: href(f), label: t(`houses.filter.${f}`), active: filter === f }));

  const stats: { label: string; value: string; note?: string; key?: boolean }[] = [
    { label: t('houses.stats.count'), value: String(totals.count) },
    {
      label: t('houses.stats.value'), value: money(totals.valueCents), key: true,
      note: totals.valueMissing ? t('houses.stats.valueNote', { n: totals.valueMissing }) : undefined,
    },
    {
      label: t('houses.stats.paid'), value: money(totals.paidCents), key: true,
      note: totals.unconfirmedCents ? t('houses.stats.paidNote', { amount: money(totals.unconfirmedCents) }) : undefined,
    },
    {
      label: t('houses.stats.left'), value: money(totals.leftCents), key: true,
      note: totals.leftMissing ? t('houses.stats.leftNote', { n: totals.leftMissing }) : undefined,
    },
    { label: t('houses.stats.fullyPaid'), value: String(totals.fullyPaid.length), note: totals.fullyPaid.join(' · ') || undefined },
    { label: t('houses.stats.partial'), value: String(totals.partial) },
    { label: t('houses.stats.hold'), value: String(totals.onHold) },
    { label: t('houses.stats.check'), value: String(totals.needsCheck) },
    { label: t('houses.stats.upcoming'), value: String(totals.upcoming) },
    { label: t('houses.stats.finishing'), value: String(totals.finishing) },
  ];

  return (
    <div>
      {header}
      <Flash saved={sp.saved} error={sp.error} />

      <section aria-label={t('houses.title')} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className={`min-w-0 rounded-2xl border bg-surface p-3 shadow-sm ${s.key ? 'border-brand' : 'border-line'}`}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 break-words text-lg font-bold tabular-nums leading-tight">{s.value}</p>
            {s.note ? <p className="mt-1 break-words text-xs text-muted">{s.note}</p> : null}
          </div>
        ))}
      </section>

      <details className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">{t('houses.add')}</summary>
        <div className="mt-3">
          <HouseForm />
        </div>
      </details>

      <form method="get" action={PATH} className="mb-4 flex flex-wrap items-end gap-2">
        {filter !== 'all' ? <input type="hidden" name="f" value={filter} /> : null}
        <div className="min-w-0 flex-1">
          <label htmlFor="house-q" className="mb-1 block text-base font-medium">{t('common.search')}</label>
          <input
            id="house-q"
            type="text"
            name="q"
            defaultValue={q}
            placeholder={t('houses.searchPlaceholder')}
            className="block min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-semibold hover:bg-muted-soft"
        >
          {t('common.filter')}
        </button>
      </form>
      <Chips items={chips} />

      {items.length === 0 ? (
        <EmptyState title={t('houses.empty')} hint={t('houses.emptyHint')} />
      ) : list.length === 0 ? (
        <EmptyState title={t('houses.noMatch')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((x) => (
            <HouseCard key={x.p.id} x={x} i18n={i18n} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function dueText(i18n: I18n, today: string, iso: string): string {
  const { t, locale } = i18n;
  const n = daysBetween(today, iso);
  const rel = n < 0 ? t('houses.daysAgo', { n: -n }) : n === 0 ? t('houses.today') : n === 1 ? t('houses.tomorrow') : t('houses.inDays', { n });
  return `${formatDate(iso, locale)} · ${rel}`;
}

function HouseCard({ x, i18n, today }: { x: Item; i18n: I18n; today: string }) {
  const { t, locale } = i18n;
  const { p, h, c } = x;
  const money = (cents: number | null) => formatEtb(cents, locale);
  const meta = [p.kind, p.location, p.house_no, p.ownership].filter(Boolean).join(' · ');
  const dueSoon = c.upcoming && p.next_due_on && !c.overdue ? daysBetween(today, p.next_due_on) : null;

  let leftValue: string;
  let leftNote: string[] = [];
  if (c.balanceCents != null) {
    leftValue = money(c.balanceCents);
  } else {
    leftValue = h.priceCents != null ? t('houses.notConfirmed') : t('houses.unknown');
    if (h.priceCents != null && c.unconfirmedCents > 0) {
      leftNote = [
        t('houses.ifAll', { amount: money(Math.max(h.priceCents - c.paidCents - c.unconfirmedCents, 0)) }),
        t('houses.ifOnly', { amount: money(c.atMostCents) }),
      ];
    } else if (c.atMostCents != null) {
      leftNote = [t('houses.atMost', { amount: money(c.atMostCents) })];
    }
  }

  const formValues: HouseFormValues = {
    id: p.id, name: p.name, kind: p.kind ?? '', location: p.location ?? '', house_no: p.house_no ?? '',
    ownership: p.ownership ?? '', price: plain(p.price), price_confirmed: p.price_confirmed, plan: p.plan,
    rounds_total: plain(p.rounds_total), round_amount: plain(p.round_amount), payments_complete: p.payments_complete,
    property_status: p.property_status, hold_reason: p.hold_reason ?? '', next_due_on: p.next_due_on ?? '',
    next_amount: plain(p.next_amount), finishing_pending: p.finishing_pending, finishing_amount: plain(p.finishing_amount),
    checks: (p.checks ?? []).join('\n'), notes: p.notes ?? '', refs: p.refs ?? '',
  };
  const defaultKind: HousePaymentKind = p.plan === 'progress' ? 'progress' : p.plan === 'full' ? 'full' : 'round';

  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold leading-snug">{p.name}</h2>
          {meta ? <p className="break-words text-sm text-muted">{meta}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge tone={STATE_TONE[c.state]}>{t(`houses.state.${c.state}`)}</Badge>
          {c.overdue ? <Badge tone="red">{t('houses.overdue')}</Badge> : null}
          {dueSoon != null && dueSoon >= 0 && dueSoon <= 14 ? (
            <Badge tone="amber">{dueSoon === 0 ? t('houses.today') : dueSoon === 1 ? t('houses.tomorrow') : t('houses.inDays', { n: dueSoon })}</Badge>
          ) : null}
          {p.property_status !== 'none' ? (
            <Badge tone={c.onHold ? 'amber' : 'gray'}>{t(`houses.status.${p.property_status}`)}</Badge>
          ) : null}
          {c.needsCheck ? <Badge tone="amber">{t('houses.needsCheck')}</Badge> : null}
        </div>
      </div>

      {c.percentPaid != null ? (
        <div
          className="h-3 overflow-hidden rounded-full bg-muted-soft"
          role="progressbar"
          aria-valuenow={c.percentPaid}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('houses.paid')}
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${c.percentPaid}%` }} />
        </div>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted">
            {t('houses.price')}
            {h.priceCents != null && !h.priceConfirmed ? ` · ${t('houses.notConfirmed')}` : ''}
          </dt>
          <dd className="break-words font-semibold tabular-nums">{h.priceCents != null ? money(h.priceCents) : t('houses.unknown')}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">
            {t('houses.paid')}
            {c.percentPaid != null ? ` · ${c.percentPaid}%` : ''}
          </dt>
          <dd className="break-words font-semibold tabular-nums">{money(c.paidCents)}</dd>
          {c.unconfirmedCents ? (
            <dd className="text-xs text-muted">{t('houses.plusUnconfirmed', { amount: money(c.unconfirmedCents) })}</dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t('houses.left')}</dt>
          <dd className="break-words font-semibold tabular-nums">{leftValue}</dd>
        </div>
      </dl>
      {leftNote.length ? <p className="whitespace-pre-line text-sm text-muted">{leftNote.join('\n')}</p> : null}

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t('houses.planLabel')}</dt>
          <dd className="font-semibold">{t(`houses.plan.${p.plan}`)}</dd>
        </div>
        {p.plan === 'rounds' || p.rounds_total ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted">{t('houses.roundsPaid')}</dt>
            <dd className="font-semibold">
              {p.rounds_total ? t('houses.roundsOf', { done: c.roundsDone, total: p.rounds_total }) : String(c.roundsDone)}
              {p.round_amount ? ` · ${t('houses.roundsEach', { amount: money(toCents(p.round_amount)) })}` : ''}
            </dd>
            {p.rounds_total ? (
              <dd className="text-xs text-muted">{t('houses.roundsLeft', { n: Math.max(p.rounds_total - c.roundsDone, 0) })}</dd>
            ) : null}
          </div>
        ) : null}
        {c.state !== 'paid' ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted">{t('houses.nextPayment')}</dt>
            <dd className="font-semibold">
              {p.next_due_on
                ? dueText(i18n, today, p.next_due_on)
                : p.plan === 'progress'
                  ? t('houses.plan.progress')
                  : t('houses.dateUnknown')}
            </dd>
            {p.next_amount ? <dd className="text-xs text-muted">{t('houses.amountLabel', { amount: money(toCents(p.next_amount)) })}</dd> : null}
          </div>
        ) : null}
        {p.finishing_pending ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted">{t('houses.finishing')}</dt>
            <dd className="font-semibold">{t('houses.pending')}</dd>
            <dd className="text-xs text-muted">{p.finishing_amount ? money(toCents(p.finishing_amount)) : t('houses.unknown')}</dd>
          </div>
        ) : null}
      </dl>

      {c.onHold ? (
        <div className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          <p className="font-semibold">{t('houses.holdTitle', { status: t(`houses.status.${p.property_status}`) })}</p>
          <p>{p.hold_reason || t('houses.reasonUnknown')}</p>
        </div>
      ) : null}
      {h.checks.length ? (
        <div className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          <p className="font-semibold">{t('houses.checkTitle')}</p>
          <ul className="list-disc ps-5">
            {h.checks.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.missing.length ? (
        <p className="text-sm text-muted">
          {t('houses.missingLabel')} {c.missing.map((m) => t(`houses.missing.${m}`)).join(' · ')}
        </p>
      ) : null}

      <details className="border-t border-line pt-2" open={c.unconfirmedCents > 0}>
        <summary className="flex min-h-12 cursor-pointer items-center font-semibold">{t('houses.history', { n: x.pays.length })}</summary>
        {x.pays.length === 0 ? (
          <p className="text-sm text-muted">{t('houses.noPayments')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {x.pays.map((pay) => (
              <li key={pay.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {t(`houses.payKind.${pay.kind}`)}
                    {pay.label ? ` · ${pay.label}` : ''}
                  </span>
                  <span className="font-semibold tabular-nums">{money(toCents(pay.amount))}</span>
                </div>
                <p className="break-words text-sm text-muted">
                  {pay.paid_on ? formatDate(pay.paid_on, locale) : t('houses.noDate')}
                  {pay.confirmed ? '' : ` · ${t('houses.unconfirmed')}`}
                  {pay.note ? ` · ${pay.note}` : ''}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {pay.confirmed ? null : (
                    <form action={confirmHousePayment}>
                      <input type="hidden" name="id" value={pay.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-on-brand hover:bg-brand-strong sm:w-auto"
                      >
                        {t('houses.markPaid')}
                      </button>
                    </form>
                  )}
                  <VoidForm table="house_payments" id={pay.id} returnTo={PATH} title={t('houses.removePayment')} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      {p.notes ? <p className="whitespace-pre-line break-words text-sm text-muted">{p.notes}</p> : null}
      {p.refs ? (
        <p className="break-words text-sm text-muted">
          <span className="font-semibold">{t('houses.field.refs')}:</span> {p.refs}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <details className="rounded-xl border border-line bg-surface p-3">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">{t('houses.recordPayment')}</summary>
          <div className="mt-3">
            <PaymentForm
              propertyId={p.id}
              today={today}
              defaultKind={defaultKind}
              defaultAmount={p.plan === 'rounds' && p.round_amount ? plain(p.round_amount) : undefined}
            />
          </div>
        </details>
        <details className="rounded-xl border border-line bg-surface p-3">
          <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold">{t('houses.edit')}</summary>
          <div className="mt-3">
            <HouseForm house={formValues} />
          </div>
        </details>
        <VoidForm table="house_properties" id={p.id} returnTo={PATH} title={t('houses.removeHouse')} />
      </div>
    </Card>
  );
}
