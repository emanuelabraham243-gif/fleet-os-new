import { describe, expect, it } from 'vitest';
import { formatEthiopianMobile, normalizeEthiopianMobile } from './phone';

describe('normalizeEthiopianMobile', () => {
  it.each([
    '0911223344',
    '911223344',
    '+251911223344',
    '251911223344',
    '00251911223344',
    '0911 22 33 44',
    '+251 911-223-344',
    '(0911) 223.344',
    '  0911223344  ',
  ])('Ethio Telecom format %j -> +251911223344', (input) => {
    expect(normalizeEthiopianMobile(input)).toBe('+251911223344');
  });

  it.each(['0711223344', '711223344', '+251711223344', '251711223344'])(
    'Safaricom format %j -> +251711223344',
    (input) => {
      expect(normalizeEthiopianMobile(input)).toBe('+251711223344');
    },
  );

  it.each([
    '',
    '0111223344', // Addis landline, not mobile
    '0811223344', // not a mobile prefix
    '091122334', // too short
    '09112233445', // too long
    '+254711223344', // Kenya
    '+1 911 223 3445',
    '0911-ABC-344',
    'tel:0911223344',
    '0911223344; drop table',
  ])('rejects %j', (input) => {
    expect(normalizeEthiopianMobile(input)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(normalizeEthiopianMobile(null)).toBeNull();
    expect(normalizeEthiopianMobile(911223344)).toBeNull();
  });
});

describe('formatEthiopianMobile', () => {
  it('shows the local form', () => {
    expect(formatEthiopianMobile('+251911223344')).toBe('0911 223 344');
    expect(formatEthiopianMobile(null)).toBe('');
  });
});
