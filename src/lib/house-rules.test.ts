import { describe, expect, it } from 'vitest';
import { calcHouse, compareHouses, houseTotals, matchesFilter, matchesSearch, splitChecks, type House } from './house-rules';

const TODAY = '2026-10-14';

function house(over: Partial<House> = {}): House {
  return {
    name: 'H', kind: null, location: 'Summit', houseNo: 'A-1', ownership: null,
    priceCents: 1_000_000_00, priceConfirmed: true, plan: 'rounds', roundsTotal: null,
    paymentsComplete: true, propertyStatus: 'none', holdReason: null,
    nextDueOn: null, nextAmountCents: null, finishingPending: false, finishingAmountCents: null,
    checks: [], payments: [], ...over,
  };
}
const pay = (amountCents: number, over: Partial<House['payments'][number]> = {}) =>
  ({ amountCents, paidOn: '2026-01-01', kind: 'round' as const, confirmed: true, ...over });

describe('calcHouse', () => {
  it('is fully paid when confirmed payments cover a confirmed price', () => {
    const c = calcHouse(house({ plan: 'full', payments: [pay(1_000_000_00, { kind: 'full' })] }), TODAY);
    expect(c.state).toBe('paid');
    expect(c.balanceCents).toBe(0);
    expect(c.percentPaid).toBe(100);
  });

  it('is not paid while a finishing payment is pending', () => {
    const c = calcHouse(house({ finishingPending: true, payments: [pay(1_000_000_00)] }), TODAY);
    expect(c.state).toBe('partial');
    expect(c.missing).toContain('finishingAmount');
  });

  it('gives a confirmed balance and counts rounds', () => {
    const c = calcHouse(house({ payments: [pay(300_000_00, { kind: 'advance' }), pay(100_000_00)] }), TODAY);
    expect(c.paidCents).toBe(400_000_00);
    expect(c.balanceCents).toBe(600_000_00);
    expect(c.roundsDone).toBe(2);
    expect(c.state).toBe('partial');
  });

  it('withholds the balance when the history is incomplete, but gives an upper bound', () => {
    const c = calcHouse(house({ paymentsComplete: false, payments: [pay(600_000_00)] }), TODAY);
    expect(c.balanceCents).toBeNull();
    expect(c.atMostCents).toBe(400_000_00);
  });

  it('keeps unconfirmed payments out of paid and flags the house for checking', () => {
    const c = calcHouse(house({ payments: [pay(100_000_00, { confirmed: false })] }), TODAY);
    expect(c.paidCents).toBe(0);
    expect(c.unconfirmedCents).toBe(100_000_00);
    expect(c.balanceCents).toBeNull();
    expect(c.needsCheck).toBe(true);
    expect(c.state).toBe('unknown');
  });

  it('flags an unconfirmed price and an unknown price', () => {
    expect(calcHouse(house({ priceConfirmed: false }), TODAY).needsCheck).toBe(true);
    const unknown = calcHouse(house({ priceCents: null }), TODAY);
    expect(unknown.missing).toContain('price');
    expect(unknown.percentPaid).toBeNull();
    expect(unknown.atMostCents).toBeNull();
  });

  it('is overdue only when both the due date and the amount are known', () => {
    expect(calcHouse(house({ nextDueOn: '2026-10-01', nextAmountCents: 1 }), TODAY).overdue).toBe(true);
    expect(calcHouse(house({ nextDueOn: '2026-10-01' }), TODAY).overdue).toBe(false);
    expect(calcHouse(house({ nextDueOn: '2026-10-20', nextAmountCents: 1 }), TODAY).overdue).toBe(false);
  });

  it('lists missing information', () => {
    const c = calcHouse(
      house({ houseNo: null, location: null, propertyStatus: 'on_hold', payments: [pay(1, { paidOn: null })] }),
      TODAY,
    );
    expect(c.onHold).toBe(true);
    expect(c.missing).toEqual(['houseNo', 'location', 'holdReason', 'paymentDates']);
    expect(c.paymentsWithoutDate).toBe(1);
  });
});

describe('filters, search and order', () => {
  it('filters by state', () => {
    const h = house({ propertyStatus: 'gov_hold', holdReason: 'x' });
    const c = calcHouse(h, TODAY);
    expect(matchesFilter(h, c, 'hold')).toBe(true);
    expect(matchesFilter(h, c, 'paid')).toBe(false);
    expect(matchesFilter(h, c, 'all')).toBe(true);
  });

  it('searches name, location, number and ownership', () => {
    const h = house({ name: 'Gihon House', ownership: 'Father' });
    expect(matchesSearch(h, 'gihon')).toBe(true);
    expect(matchesSearch(h, 'father')).toBe(true);
    expect(matchesSearch(h, 'abay')).toBe(false);
    expect(matchesSearch(h, '  ')).toBe(true);
  });

  it('puts overdue first and fully paid last', () => {
    const mk = (h: House, order: number) => ({ h, c: calcHouse(h, TODAY), order });
    const paid = mk(house({ name: 'paid', payments: [pay(1_000_000_00)] }), 1);
    const open = mk(house({ name: 'open' }), 2);
    const late = mk(house({ name: 'late', nextDueOn: '2026-10-01', nextAmountCents: 5 }), 3);
    expect([paid, open, late].sort(compareHouses).map((x) => x.h.name)).toEqual(['late', 'open', 'paid']);
  });
});

describe('houseTotals', () => {
  it('counts only confirmed figures', () => {
    const list = [
      house({ name: 'A', payments: [pay(1_000_000_00)] }),
      house({ name: 'B', priceCents: null, payments: [pay(50_00)] }),
      house({ name: 'C', priceConfirmed: false, payments: [pay(10_00, { confirmed: false })] }),
    ].map((h) => ({ h, c: calcHouse(h, TODAY) }));
    const t = houseTotals(list);
    expect(t.count).toBe(3);
    expect(t.valueCents).toBe(1_000_000_00);
    expect(t.valueMissing).toBe(2);
    expect(t.paidCents).toBe(1_000_050_00);
    expect(t.unconfirmedCents).toBe(10_00);
    expect(t.leftCents).toBe(0);
    expect(t.leftMissing).toBe(2);
    expect(t.fullyPaid).toEqual(['A']);
  });
});

describe('splitChecks', () => {
  it('keeps one trimmed item per non-empty line', () => {
    expect(splitChecks(' a \n\n b\n')).toEqual(['a', 'b']);
    expect(splitChecks(undefined)).toEqual([]);
  });
});
