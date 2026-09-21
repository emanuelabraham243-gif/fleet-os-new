import { describe, expect, it } from 'vitest';
import { classifySignal, getGpsProvider } from './gps';

const now = Date.parse('2026-09-21T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

describe('classifySignal', () => {
  it('classifies boundaries', () => {
    expect(classifySignal(ago(5), now).state).toBe('LIVE');
    expect(classifySignal(ago(5.5), now).state).toBe('DELAYED');
    expect(classifySignal(ago(60), now).state).toBe('DELAYED');
    expect(classifySignal(ago(61), now).state).toBe('OFFLINE');
  });
  it('returns UNKNOWN for null, invalid and far-future', () => {
    expect(classifySignal(null, now).state).toBe('UNKNOWN');
    expect(classifySignal('garbage', now).state).toBe('UNKNOWN');
    expect(classifySignal(ago(-3), now).state).toBe('UNKNOWN');
    expect(classifySignal(ago(-1), now).state).toBe('LIVE');
  });
});

describe('MockGpsProvider', () => {
  it('yields all four states', async () => {
    const p = getGpsProvider();
    const res = await p.getLatest(['a', 'b', 'c', 'd']);
    const states = new Set(res.map((r) => classifySignal(r.timestamp).state));
    expect(states).toEqual(new Set(['LIVE', 'DELAYED', 'OFFLINE', 'UNKNOWN']));
  });
});
