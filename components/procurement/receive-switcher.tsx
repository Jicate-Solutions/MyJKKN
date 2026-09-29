'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The Receive tab holds two lists: orders the Super Admin approved that are waiting
 * for delivery, and the goods receipts recorded against them. They used to be two
 * separate top-level tabs; one tab with this switch keeps the procurement nav to
 * Requests · Purchase · Receive (docs/procurement/simplified-flow-spec.md).
 */
const VIEWS = [
  { key: 'orders', label: 'Orders to receive', href: '/procurement/purchase-orders' },
  { key: 'receipts', label: 'Goods received', href: '/procurement/grn' },
] as const;

export function ReceiveSwitcher({ active }: { active: (typeof VIEWS)[number]['key'] }) {
  return (
    <div role="tablist" aria-label="Receive" className="inline-flex rounded-md border bg-muted/40 p-1">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          role="tab"
          aria-selected={v.key === active}
          className={cn(
            'rounded px-3 py-1.5 text-sm transition-colors',
            v.key === active
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
