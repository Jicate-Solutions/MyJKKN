'use client';

/**
 * Section Sub-Navigation (reusable)
 * Secondary tab bar shown on LC section pages to expose hidden sub-pages.
 * Used by Structure, Communication, Events, OD, Selection.
 *
 * Permission filtering: tabs are filtered using MENU_PERMISSIONS (same map the
 * sidebar uses). Tabs with no matching entry are always shown.
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
  /** Only considered active on exact pathname match (used for section root) */
  exact?: boolean;
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
    return pathname === tab.href || pathname.startsWith(tab.href + '/');
  };

  const visibleTabs = tabs.filter((t) => canShowTab(t.href));

  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border mb-4 max-w-full">
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
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
