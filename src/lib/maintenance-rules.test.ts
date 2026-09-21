import { describe, expect, it } from 'vitest';
import {
  hasInterval, normalizeStatus, odometerJumpNeedsConfirm, remainingKm, unknownReason,
} from './maintenance-rules';

describe('maintenance rules', () => {
  it('odometer jump only for large increases', () => {
    expect(odometerJumpNeedsConfirm(12001, 10000)).toBe(true);
    expect(odometerJumpNeedsConfirm(12000, 10000)).toBe(false);
    expect(odometerJumpNeedsConfirm(500, 10000)).toBe(false);
    expect(odometerJumpNeedsConfirm(50000, null)).toBe(false);
    expect(odometerJumpNeedsConfirm(null, 100)).toBe(false);
  });
  it('hasInterval needs km or days', () => {
    expect(hasInterval('', '')).toBe(false);
    expect(hasInterval(undefined, ' ')).toBe(false);
    expect(hasInterval('5000', '')).toBe(true);
    expect(hasInterval('', '90')).toBe(true);
  });
  it('unknownReason never fabricates', () => {
    expect(unknownReason({ next_due_date: null, next_due_odometer: null, current_odometer: 5 })).toBe('noDueInfo');
    expect(unknownReason({ next_due_date: null, next_due_odometer: 100, current_odometer: null })).toBe('noOdometer');
    expect(unknownReason({ next_due_date: '2026-10-01', next_due_odometer: null, current_odometer: null })).toBeNull();
  });
  it('remainingKm', () => {
    expect(remainingKm(1000, 400.5)).toBe(599.5);
    expect(remainingKm(1000, 1200)).toBe(-200);
    expect(remainingKm(1000, null)).toBeNull();
    expect(remainingKm(null, 5)).toBeNull();
  });
  it('normalizeStatus', () => {
    expect(normalizeStatus('OVERDUE')).toBe('OVERDUE');
    expect(normalizeStatus(null)).toBe('UNKNOWN');
    expect(normalizeStatus('x')).toBe('UNKNOWN');
  });
});
