'use client';

/**
 * Section Sub-Navigation (shared, reusable across modules)
 *
 * Secondary tab bar for navigating between related pages within a module
 * section. First used in Learners Council (see lc-nav.tsx + structure/layout.tsx).
 * Now shared so other modules (Campus Living, etc.) can use the same pattern.
 *
 * Pattern:
 *   Tier 1: module-level nav (e.g. LCNav, CLNav) — across-module tabs
 *   Tier 2: SectionSubNav — intra-section tabs (what this component renders)
 *   Tier 3: nested SectionSubNav — drills further within a sub-page
 *
 * Permission filtering: tabs are filtered using MENU_PERMISSIONS (same map the
 * sidebar uses). A tab whose href has no entry in MENU_PERMISSIONS is always
 * shown. During the async permission load, all tabs are visible to prevent
 * a flash-of-unauthorized-content/disappearance race.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { MENU_PERMISSIONS, normalizeRoute } from '@/lib/sidebarMenuLink';

export interface SectionTab {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Active only on exact pathname match (used for section root) */
  exact?: boolean;
  /** Extra paths that should also mark this tab active (e.g. nested sub-routes) */
  matchPaths?: string[];
}

export function SectionSubNav({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  const { permissions, isSuperAdmin, isLoading } = usePermissions();

  const canShowTab = (href: string): boolean => {
    if (isLoading) return true;
    if (isSuperAdmin) return true;
    const perm = MENU_PERMISSIONS[normalizeRoute(href)];
    if (!perm) return true;
    return permissions[perm] === true;
  };

  const isActive = (tab: SectionTab) => {
    if (tab.exact) return pathname === tab.href;
    if (pathname === tab.href || pathname.startsWith(tab.href + '/')) return true;
    if (tab.matchPaths?.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return true;
    }
    return false;
  };

  const visibleTabs = tabs.filter((t) => canShowTab(t.href));

  return (
    <div className='flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border mb-4 max-w-full'>
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap',
              active
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className='h-3.5 w-3.5' />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
