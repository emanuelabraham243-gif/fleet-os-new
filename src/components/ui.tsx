import Link from 'next/link';
import type { ReactNode } from 'react';
import { getI18n } from '@/lib/i18n';

export type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';

const toneClass: Record<Tone, string> = {
  green: 'bg-ok-soft text-ok-ink',
  amber: 'bg-warn-soft text-warn-ink',
  red: 'bg-bad-soft text-bad-ink',
  gray: 'bg-muted-soft text-muted-ink',
  blue: 'bg-info-soft text-info-ink',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-snug">{title}</h1>
        {subtitle ? <p className="mt-1 text-base text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium leading-snug ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

const RED = new Set(['EXPIRED', 'OVERDUE', 'OUT_OF_SERVICE', 'OFFLINE', 'CANCELLED', 'HIGH', 'CRITICAL', 'URGENT']);
const AMBER = new Set(['EXPIRING_SOON', 'DUE_SOON', 'DELAYED', 'MAINTENANCE', 'PLANNED', 'MEDIUM', 'STALE']);
const GREEN = new Set(['VALID', 'OK', 'LIVE', 'COMPLETED', 'AVAILABLE', 'CLOSED', 'DONE', 'RESOLVED', 'LOW']);
const BLUE = new Set(['ON_TRIP', 'IN_PROGRESS', 'OPEN', 'SCHEDULED']);

export function statusTone(group: string, code: string): Tone {
  void group;
  const c = code.toUpperCase();
  if (RED.has(c)) return 'red';
  if (AMBER.has(c)) return 'amber';
  if (GREEN.has(c)) return 'green';
  if (BLUE.has(c)) return 'blue';
  return 'gray';
}

export async function StatusBadge({ group, code }: { group: string; code: string }) {
  const { label } = await getI18n();
  return <Badge tone={statusTone(group, code)}>{label(group, code)}</Badge>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
      {title ? <p className="text-lg font-semibold">{title}</p> : null}
      {hint ? <p className="mt-1 text-base text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums leading-tight">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}

const btnBase =
  'inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-2 text-base font-semibold leading-snug transition-colors';
const btnVariant = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  secondary: 'border border-line bg-surface text-foreground hover:bg-muted-soft',
  ghost: 'text-brand-ink hover:bg-muted-soft',
} as const;

export function LinkButton({
  href,
  variant = 'primary',
  children,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${btnBase} ${btnVariant[variant]}`}>
      {children}
    </Link>
  );
}

export function Chips({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.active ? 'true' : undefined}
              className={`inline-flex min-h-12 items-center rounded-full border px-4 text-base leading-snug ${
                it.active
                  ? 'border-brand bg-brand font-semibold text-on-brand'
                  : 'border-line bg-surface text-foreground hover:bg-muted-soft'
              }`}
            >
              {it.active ? <span aria-hidden="true">✓&nbsp;</span> : null}
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function Flash({ saved, error }: { saved?: string | string[]; error?: string | string[] }) {
  const { t, dict } = await getI18n();
  const s = Array.isArray(saved) ? saved[0] : saved;
  const e = Array.isArray(error) ? error[0] : error;
  if (!s && !e) return null;
  const errors = dict.errors as Record<string, unknown>;
  return (
    <div aria-live="polite" className="mb-4 space-y-2">
      {s ? (
        <p role="status" className="rounded-xl bg-ok-soft px-4 py-3 text-base font-medium text-ok-ink">
          {t('common.saved')}
        </p>
      ) : null}
      {e ? (
        <p role="alert" className="rounded-xl bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {typeof errors?.[e] === 'string' ? t('errors.' + e) : t('errors.generic')}
        </p>
      ) : null}
    </div>
  );
}
