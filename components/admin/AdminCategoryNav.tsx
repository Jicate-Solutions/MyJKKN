'use client';

/**
 * AdminCategoryNav — Tier 3 in-page sub-tab strip for a specific admin
 * category (Notifications, PDE, LTI, Counselors, System).
 *
 * Consumed by per-category layouts under `app/(routes)/admin/<category>/layout.tsx`
 * (Agent N's PR). This component looks up the category's pages from the
 * filesystem-derived nav tree and renders one chip per sub-page.
 *
 * Active-page detection uses longest-prefix match so deep routes like
 * `/admin/pde/quests/create` correctly highlight the `Quests` chip rather
 * than the parent `PDE` index.
 *
 * Filtering
 * ---------
 * `hideCreatePages` (default true) hides pages whose slug ends in `/new` or
 * `/create` — these are entry points reachable from their parent page's
 * "Create" CTA, so showing them as top-level chips would be redundant. Set
 * to false to surface every navigable page (useful during development).
 *
 * Pattern reference: components/navigation/section-subnav.tsx — same visual
 * shell, but driven by the auto-discovered tree instead of a hand-curated
 * tabs array.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  getAdminNavTree,
  type AdminCategoryNode,
  type AdminPageNode,
} from '@/lib/admin/nav-tree';

function getIcon(iconName: string): LucideIcon {
  const icon = (Icons as unknown as Record<string, LucideIcon>)[iconName];
  return icon ?? Icons.FileText;
}

function isCreateRoute(page: AdminPageNode): boolean {
  return page.href.endsWith('/new') || page.href.endsWith('/create');
}

interface AdminCategoryNavProps {
  /** Category key, e.g. 'notifications', 'pde', 'lti', 'counselors', 'system'. */
  category: string;
  /**
   * Hide create-route pages (e.g. `/admin/notifications/new`) so they don't
   * clutter the Tier-3 strip. Defaults to true.
   */
  hideCreatePages?: boolean;
  className?: string;
}

export function AdminCategoryNav({
  category,
  hideCreatePages = true,
  className,
}: AdminCategoryNavProps) {
  const pathname = usePathname();
  const tree = getAdminNavTree();
  const node: AdminCategoryNode | undefined = tree.find((c) => c.key === category);

  if (!node) return null;

  const visiblePages = hideCreatePages
    ? node.pages.filter((p) => !isCreateRoute(p))
    : node.pages;

  // Don't render a 1-chip strip — there's nothing to navigate between.
  if (visiblePages.length < 2) return null;

  // Longest-prefix match for active page (so /admin/pde/quests/create
  // highlights the "Quests" chip, not "PDE").
  let activeHref: string | null = null;
  let bestLen = -1;
  if (pathname) {
    for (const p of visiblePages) {
      if (
        (pathname === p.href || pathname.startsWith(`${p.href}/`)) &&
        p.href.length > bestLen
      ) {
        activeHref = p.href;
        bestLen = p.href.length;
      }
    }
  }

  return (
    <nav
      aria-label={`${node.label} sub-pages`}
      className={cn(
        'flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border max-w-full',
        className
      )}
    >
      {visiblePages.map((page) => {
        const Icon = getIcon(page.iconName);
        const isActive = page.href === activeHref;
        return (
          <Link
            key={page.href}
            href={page.href}
            data-admin-page={page.href}
            data-active={isActive ? 'true' : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap',
              isActive
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
