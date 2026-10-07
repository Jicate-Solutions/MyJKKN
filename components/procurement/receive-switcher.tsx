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
  { key: 'orders', label: 'Purchase orders', href: '/procurement/purchase-orders' },
  { key: 'receipts', label: 'Goods received', href: '/procurement/grn' },
] as const;

export function ReceiveSwitcher({ active }: { active: (typeof VIEWS)[number]['key'] }) {
  return (
    // Same size and look as the List | Table toggle, so it can sit in a toolbar row.
    <div role="tablist" aria-label="Deliveries" className="inline-flex h-9 gap-0.5 rounded-lg bg-muted p-[3px]">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          role="tab"
          aria-selected={v.key === active}
          className={cn(
            'inline-flex h-[30px] items-center whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors',
            v.key === active
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
