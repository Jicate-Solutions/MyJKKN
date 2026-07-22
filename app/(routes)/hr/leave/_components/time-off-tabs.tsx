'use client';

/**
 * Time Off workspace navigation — top tabs + optional sub-tabs.
 *
 * Link-based rather than Radix Tabs: each tab is a real route, so the view is
 * deep-linkable, survives refresh, and stays visible to the nav reachability
 * check. Radix Tabs would collapse all four into one URL.
 *
 * The Approvals tab is gated on useCanApproveLeave(), which mirrors the
 * hla_update RLS policy server-side. It resolves true for super admins and the
 * five roles holding hr.leave.approve (CEO, COO, HR Administrator, HR Head,
 * HR Manager). Rendering it optimistically would show a tab that leads to a
 * page the database refuses to serve.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useCanApproveLeave } from '@/hooks/hr/use-hr-leave-types';

export interface TimeOffSubTab {
  label: string;
  href: string;
}

const TOP_TABS = [
  { label: 'Leave', href: '/hr/leave/requests' },
  { label: 'Compensatory Off', href: '/hr/leave/compensatory-off' },
  { label: 'Short Time Off', href: '/hr/leave/short-time-off' },
] as const;

const APPROVALS_TAB = { label: 'Approvals', href: '/hr/leave/approvals' } as const;

export function TimeOffTabs({ subTabs }: { subTabs?: TimeOffSubTab[] }) {
  const pathname = usePathname();
  // usePathname() strips the query, so comparing it to '/x?tab=balance'
  // never matched and the Balance sub-tab could never highlight.
  const search = useSearchParams();
  const { data: canApprove } = useCanApproveLeave();

  const tabs = canApprove ? [...TOP_TABS, APPROVALS_TAB] : TOP_TABS;

  return (
    <div className="border-b">
      {/* Top level — horizontal scroll rather than wrap, so the bar keeps one
          row on narrow screens instead of reflowing the page. */}
      <nav className="flex gap-1 overflow-x-auto" aria-label="Time off sections">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {t.label}
              {active && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {subTabs && subTabs.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto pt-1" aria-label="Section views">
          {subTabs.map((s) => {
            const [sPath, sQuery] = s.href.split('?');
            const sTab = sQuery ? new URLSearchParams(sQuery).get('tab') : null;
            const active = pathname === sPath && (search.get('tab') ?? null) === sTab;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative whitespace-nowrap px-3 py-2 text-sm transition-colors rounded-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground/70" />
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
