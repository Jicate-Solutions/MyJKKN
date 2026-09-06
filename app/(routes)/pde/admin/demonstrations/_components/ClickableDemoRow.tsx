'use client';

// =====================================================================
// ClickableDemoRow — makes a whole validator-inbox row open the detail view.
// =====================================================================
// The demonstrations inbox is a server component; this small client wrapper
// adds row-level navigation (previously only the "Validate" link in the last
// cell was clickable, so most of the wide row was dead space). The "Validate"
// link inside still works and stops propagation so it doesn't double-fire.
// =====================================================================

import { useRouter } from 'next/navigation';
import type { ReactNode, KeyboardEvent } from 'react';
import { TableRow } from '@/components/ui/table';

export function ClickableDemoRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const go = () => router.push(href);

  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go();
    }
  };

  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
      className="cursor-pointer hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
    >
      {children}
    </TableRow>
  );
}
