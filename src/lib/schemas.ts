import { z, type ZodError } from 'zod';
import { parseDecimal, parseMoney } from './money';
import { todayAddis, daysBetween } from './format';

/** All error messages are keys of the `errors` dictionary namespace. */

export function zMoney() {
  return z
    .string({ error: 'required' })
    .trim()
    .min(1, 'required')
    .transform((s, ctx) => {
      const v = parseMoney(s);
      if (v === null) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return v;
    });
}

export function zQuantity({ max }: { max: number }) {
  return z
    .string({ error: 'required' })
    .trim()
    .min(1, 'required')
    .transform((s, ctx) => {
      const v = parseDecimal(s, { maxInt: 9, maxFrac: 2 });
      if (v === null || Number(v) <= 0 || Number(v) > max) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return v;
    });
}

/** Optional: empty/undefined => undefined. */
export function zOdometer() {
  return z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s == null || s.trim() === '') return undefined;
      const v = parseDecimal(s, { maxInt: 7, maxFrac: 1 });
      // A missing odometer is never 0: reject zero/negative readings.
      if (v === null || Number(v) <= 0) {
        ctx.addIssue({ code: 'custom', message: 'invalidNumber' });
        return z.NEVER;
      }
      return v;
    });
}

export function zDate({ allowFuture = false }: { allowFuture?: boolean } = {}) {
  return z
    .string({ error: 'required' })
    .trim()
    .min(1, 'required')
    .superRefine((s, ctx) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) {
        ctx.addIssue({ code: 'custom', message: 'invalidDate' });
        return;
      }
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      if (
        d.getUTCFullYear() !== Number(m[1]) ||
        d.getUTCMonth() !== Number(m[2]) - 1 ||
        d.getUTCDate() !== Number(m[3])
      ) {
        ctx.addIssue({ code: 'custom', message: 'invalidDate' });
        return;
      }
      if (!allowFuture && daysBetween(todayAddis(), s) > 1) {
        ctx.addIssue({ code: 'custom', message: 'futureDate' });
      }
    });
}

export function zOptionalText(max: number) {
  return z
    .string()
    .optional()
    .transform((s) => (s == null ? '' : s.trim()))
    .pipe(z.string().max(max, 'tooLong'))
    .transform((s) => (s === '' ? undefined : s));
}

export function zText(max: number) {
  return z.string({ error: 'required' }).trim().min(1, 'required').max(max, 'tooLong');
}

export function zUuid() {
  return z.string({ error: 'required' }).uuid('invalidChoice');
}

export function zChoice<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values, { error: 'invalidChoice' });
}

export function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
