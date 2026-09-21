'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

/** A chip link that scrolls itself into view (horizontally) on mount when active. */
export function ChipLink({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active]);
  return (
    <Link ref={ref} href={href} aria-current={active ? 'true' : undefined} className={className}>
      {children}
    </Link>
  );
}
