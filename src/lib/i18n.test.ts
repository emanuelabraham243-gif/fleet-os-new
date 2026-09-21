import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dictionaries } from '../locales/index';
import { enumLabel, translate } from './i18n-core';

function flatten(o: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[p] = v;
    else Object.assign(out, flatten(v, p));
  }
  return out;
}

const en = flatten(dictionaries.en);
const am = flatten(dictionaries.am);

describe('dictionaries', () => {
  it('have identical key sets', () => {
    expect(Object.keys(am).sort()).toEqual(Object.keys(en).sort());
  });
  it('have no empty strings', () => {
    for (const d of [en, am]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('');
  });
  it('am enums are translated', () => {
    for (const k of Object.keys(en).filter((x) => x.startsWith('enums.'))) {
      expect(am[k], k).not.toBe(en[k]);
    }
  });
  it('am has the same placeholders as en', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(en)) expect(ph(am[k]), k).toBe(ph(en[k]));
  });
});

describe('translate', () => {
  const d = dictionaries.en;
  it('interpolates and falls back to key', () => {
    expect(translate(d, 'gps.lastSignalMinutes', { n: 5 })).toBe('Last signal received 5 minutes ago');
    expect(translate(d, 'no.such.key')).toBe('no.such.key');
    expect(translate(d, 'common')).toBe('common');
  });
  it('enumLabel', () => {
    expect(enumLabel(dictionaries.am, 'fuelType', 'DIESEL')).toBe('ናፍጣ');
    expect(enumLabel(d, 'fuelType', 'XYZ')).toBe('XYZ');
    expect(enumLabel(d, 'fuelType', null)).toBe('');
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('literal translation keys used in source exist', () => {
  const files = walk(path.resolve(__dirname, '..'));
  const tRe = /(?<![\w.$])t\(\s*(['"])([^'"`$]+)\1\s*[,)]/g;
  const lRe = /(?<![\w.$])label\(\s*(['"])([^'"`$]+)\1\s*(?:,\s*(['"])([^'"`$]+)\3\s*[,)])?/g;
  it('all literal t()/label() keys exist in the dictionary', () => {
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const rel = path.relative(process.cwd(), f);
      for (const m of src.matchAll(tRe)) {
        if (!(m[2] in en)) missing.push(`${rel}: t('${m[2]}')`);
      }
      for (const m of src.matchAll(lRe)) {
        const group = m[2];
        const has = Object.keys(en).some((k) => k.startsWith(`enums.${group}.`));
        if (!has) missing.push(`${rel}: label group '${group}'`);
        else if (m[4] && !(`enums.${group}.${m[4]}` in en)) missing.push(`${rel}: label('${group}','${m[4]}')`);
      }
    }
    expect(missing).toEqual([]);
  });
});
