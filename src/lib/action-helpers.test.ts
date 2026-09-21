import { describe, expect, it } from 'vitest';
import { formValues, mapDbError, safeReturnTo } from './action-helpers';

describe('mapDbError', () => {
  it('maps known errors', () => {
    expect(mapDbError({ code: '42501' })).toBe('noPermission');
    expect(mapDbError({ message: 'vehicle already has a trip in progress' })).toBe('vehicleBusy');
    expect(mapDbError({ message: 'vehicle is MAINTENANCE' })).toBe('vehicleUnavailable');
    expect(mapDbError({ message: 'vehicle is OUT_OF_SERVICE' })).toBe('vehicleUnavailable');
    expect(mapDbError({ message: 'driver is not active' })).toBe('driverInactive');
    expect(mapDbError({ message: 'expense vehicle does not match trip' })).toBe('expenseVehicle');
    expect(mapDbError({ message: 'reason is required' })).toBe('voidReasonRequired');
    expect(mapDbError({ code: '23503' })).toBe('badReference');
    expect(mapDbError({ code: '23505' })).toBe('duplicate');
    expect(mapDbError({ message: 'boom' })).toBe('generic');
    expect(mapDbError(null)).toBe('generic');
  });
});

describe('safeReturnTo', () => {
  it('accepts same-origin paths only', () => {
    expect(safeReturnTo('/trips?x=1', '/')).toBe('/trips?x=1');
    for (const bad of ['//evil.com', 'https://x', '\\\\x', '/\\evil.com', 'trips', '', null, 5]) {
      expect(safeReturnTo(bad, '/fallback')).toBe('/fallback');
    }
  });
});

describe('formValues', () => {
  it('keeps string entries', () => {
    const fd = new FormData();
    fd.set('a', '1');
    fd.set('f', new Blob(['x']), 'x.txt');
    expect(formValues(fd)).toEqual({ a: '1' });
  });
});
