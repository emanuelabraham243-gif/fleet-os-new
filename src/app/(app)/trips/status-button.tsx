'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

const styles = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  danger: 'border border-line bg-surface text-bad-ink hover:bg-muted-soft',
} as const;

/** Submit button for a status-change form: disabled while the action is pending. */
export function StatusButton({
  children,
  variant = 'primary',
}: {
  children: ReactNode;
  variant?: keyof typeof styles;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-semibold leading-snug disabled:opacity-60 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
