/**
 * House & real estate payments: every figure on the page comes from here.
 * "Confirmed" totals never include unknown or unverified numbers.
 * Amounts are integer cents (see money.ts).
 */
import { daysBetween } from './format';

export const HOUSE_PLANS = ['full', 'rounds', 'progress', 'other'] as const;
export const HOUSE_STATUSES = ['none', 'under_construction', 'gov_hold', 'on_hold', 'handed_over'] as const;
export const HOUSE_PAYMENT_KINDS = ['advance', 'round', 'progress', 'finishing', 'full', 'other'] as const;
export const HOUSE_FILTERS = ['all', 'paid', 'partial', 'hold', 'check', 'upcoming', 'finishing'] as const;

export type HousePlan = (typeof HOUSE_PLANS)[number];
export type HouseStatus = (typeof HOUSE_STATUSES)[number];
export type HousePaymentKind = (typeof HOUSE_PAYMENT_KINDS)[number];
export type HouseFilter = (typeof HOUSE_FILTERS)[number];

export type HousePayment = {
  amountCents: number;
  paidOn: string | null;
  kind: HousePaymentKind;
  confirmed: boolean;
};

export type House = {
  name: string;
  kind: string | null;
  location: string | null;
  houseNo: string | null;
  ownership: string | null;
  priceCents: number | null;
  priceConfirmed: boolean;
  plan: HousePlan;
  roundsTotal: number | null;
  paymentsComplete: boolean;
  propertyStatus: HouseStatus;
  holdReason: string | null;
  nextDueOn: string | null;
  nextAmountCents: number | null;
  finishingPending: boolean;
  finishingAmountCents: number | null;
  checks: string[];
  payments: HousePayment[];
};

/** paid: settled; partial: something paid; unpaid: nothing paid and nothing unknown; unknown: can't tell. */
export type PayState = 'paid' | 'partial' | 'unpaid' | 'unknown';

/** Missing-information keys (each is a key under `houses.missing`). */
export type MissingKey = 'price' | 'houseNo' | 'location' | 'nextDate' | 'finishingAmount' | 'holdReason' | 'paymentDates';

export type HouseCalc = {
  paidCents: number;
  unconfirmedCents: number;
  /** Confirmed balance; null when it depends on something unknown or unconfirmed. */
  balanceCents: number | null;
  /** Upper bound of the balance when the confirmed one is unknown but the price is known. */
  atMostCents: number | null;
  percentPaid: number | null;
  state: PayState;
  needsCheck: boolean;
  onHold: boolean;
  upcoming: boolean;
  overdue: boolean;
  roundsDone: number;
  missing: MissingKey[];
  paymentsWithoutDate: number;
};

export function calcHouse(h: House, today: string): HouseCalc {
  let paid = 0;
  let unconf = 0;
  let noDate = 0;
  let roundsDone = 0;
  for (const p of h.payments) {
    if (p.confirmed) {
      paid += p.amountCents;
      if (p.kind === 'round' || p.kind === 'advance') roundsDone++;
    } else {
      unconf += p.amountCents;
    }
    if (!p.paidOn) noDate++;
  }
  const priceKnown = h.priceCents != null;
  const balance =
    priceKnown && h.priceConfirmed && h.paymentsComplete && unconf === 0
      ? Math.max(h.priceCents! - paid, 0)
      : null;
  const atMost = balance == null && priceKnown ? Math.max(h.priceCents! - paid, 0) : null;
  const state: PayState =
    balance === 0 && !h.finishingPending
      ? 'paid'
      : paid > 0
        ? 'partial'
        : priceKnown && h.paymentsComplete && unconf === 0
          ? 'unpaid'
          : 'unknown';
  const needsCheck = h.checks.length > 0 || unconf > 0 || (priceKnown && !h.priceConfirmed);
  const onHold = h.propertyStatus === 'gov_hold' || h.propertyStatus === 'on_hold';
  const upcoming = state !== 'paid' && (Boolean(h.nextDueOn) || h.nextAmountCents != null);
  // Overdue only when both the amount and the due date are known.
  const overdue = upcoming && Boolean(h.nextDueOn) && h.nextAmountCents != null && daysBetween(today, h.nextDueOn!) < 0;

  const missing: MissingKey[] = [];
  if (!priceKnown) missing.push('price');
  if (!h.houseNo) missing.push('houseNo');
  if (!h.location) missing.push('location');
  if (state !== 'paid' && h.plan !== 'progress' && !onHold && !h.nextDueOn) missing.push('nextDate');
  if (h.finishingPending && h.finishingAmountCents == null) missing.push('finishingAmount');
  if (onHold && !h.holdReason) missing.push('holdReason');
  if (noDate > 0) missing.push('paymentDates');

  const percentPaid = priceKnown && h.priceCents! > 0 ? Math.min(100, Math.round((paid / h.priceCents!) * 100)) : null;

  return {
    paidCents: paid,
    unconfirmedCents: unconf,
    balanceCents: balance,
    atMostCents: atMost,
    percentPaid,
    state,
    needsCheck,
    onHold,
    upcoming,
    overdue,
    roundsDone,
    missing,
    paymentsWithoutDate: noDate,
  };
}

export function matchesFilter(h: House, c: HouseCalc, filter: HouseFilter): boolean {
  switch (filter) {
    case 'paid': return c.state === 'paid';
    case 'partial': return c.state === 'partial';
    case 'hold': return c.onHold;
    case 'check': return c.needsCheck;
    case 'upcoming': return c.upcoming;
    case 'finishing': return h.finishingPending;
    default: return true;
  }
}

export function matchesSearch(h: House, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [h.name, h.location, h.houseNo, h.ownership, h.kind].join(' ').toLowerCase().includes(needle);
}

const STATE_RANK: Record<PayState, number> = { partial: 0, unpaid: 0, unknown: 1, paid: 3 };

/** Overdue first, then open balances, then by next due date, then the saved order. */
export function compareHouses(
  a: { h: House; c: HouseCalc; order: number },
  b: { h: House; c: HouseCalc; order: number },
): number {
  if (a.c.overdue !== b.c.overdue) return a.c.overdue ? -1 : 1;
  const ra = STATE_RANK[a.c.state];
  const rb = STATE_RANK[b.c.state];
  if (ra !== rb) return ra - rb;
  const na = a.h.nextDueOn ?? '9999';
  const nb = b.h.nextDueOn ?? '9999';
  if (na !== nb) return na < nb ? -1 : 1;
  return a.order - b.order;
}

export type HouseTotals = {
  count: number;
  valueCents: number;
  valueMissing: number;
  paidCents: number;
  unconfirmedCents: number;
  leftCents: number;
  leftMissing: number;
  fullyPaid: string[];
  partial: number;
  onHold: number;
  needsCheck: number;
  upcoming: number;
  finishing: number;
};

export function houseTotals(all: { h: House; c: HouseCalc }[]): HouseTotals {
  const t: HouseTotals = {
    count: all.length, valueCents: 0, valueMissing: 0, paidCents: 0, unconfirmedCents: 0,
    leftCents: 0, leftMissing: 0, fullyPaid: [], partial: 0, onHold: 0, needsCheck: 0, upcoming: 0, finishing: 0,
  };
  for (const { h, c } of all) {
    if (h.priceCents != null && h.priceConfirmed) t.valueCents += h.priceCents;
    else t.valueMissing++;
    t.paidCents += c.paidCents;
    t.unconfirmedCents += c.unconfirmedCents;
    if (c.balanceCents != null) t.leftCents += c.balanceCents;
    else t.leftMissing++;
    if (c.state === 'paid') t.fullyPaid.push(h.name);
    if (c.state === 'partial') t.partial++;
    if (c.onHold) t.onHold++;
    if (c.needsCheck) t.needsCheck++;
    if (c.upcoming) t.upcoming++;
    if (h.finishingPending) t.finishing++;
  }
  return t;
}

/** "Some text\n\n  other " -> ['Some text', 'other'] */
export function splitChecks(text: string | undefined): string[] {
  return (text ?? '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30);
}
