'use client';

/**
 * OKR & Performance Module Navigation
 *
 * Top-level tab bar rendered by okr/layout.tsx on every OKR page.
 * Mirrors the Learners Council / Campus Living / Admission CRM pattern:
 *   Tier 1 (this file): OKR module tabs — one tab per hierarchy scope + ops
 *   Tier 2: SectionSubNav per section (e.g. /okr/objectives shows peer tabs
 *           All Objectives + Create Objective)
 *
 * URLs are kept UNCHANGED — no bookmarks break. Grouping is expressed via
 * `groupPaths` so a top-level tab stays active across peer routes (e.g.
 * My OKRs stays active on /okr/check-in, Compliance stays active anywhere
 * under /okr/admin).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Target,
  Users,
  Building2,
  Building,
  FolderTree,
  BarChart,
  Settings,
  Shield,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OKRTab {
  href: string;
  icon: typeof Target;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

/**
 * 10 top-level tabs — replaces the 11 sidebar entries (submenus collapse
 * into the /okr/objectives SectionSubNav). URLs point to section anchors.
 */
const tabs: OKRTab[] = [
  {
    href: '/okr',
    icon: LayoutDashboard,
    label: 'Dashboard',
    exact: true,
  },
  {
    href: '/okr/objectives',
    icon: Target,
    label: 'My OKRs',
    groupPaths: ['/okr/objectives', '/okr/check-in'],
  },
  {
    href: '/okr/team',
    icon: Users,
    label: 'Team',
  },
  {
    href: '/okr/department',
    icon: Building2,
    label: 'Department',
  },
  {
    href: '/okr/organization',
    icon: Building,
    label: 'Organization',
  },
  {
    href: '/okr/cascade',
    icon: FolderTree,
    label: 'Cascade',
  },
  {
    href: '/okr/analytics',
    icon: BarChart,
    label: 'Analytics',
  },
  {
    href: '/okr/manage',
    icon: Settings,
    label: 'Manage',
  },
  {
    href: '/okr/admin/compliance',
    icon: Shield,
    label: 'Compliance',
    groupPaths: ['/okr/admin'],
  },
  {
    href: '/okr/abcd',
    icon: CircleDot,
    label: 'ABCD',
  },
];

export function OKRNav() {
  const pathname = usePathname();

  const isActive = (tab: OKRTab) => {
    if (tab.exact) return pathname === tab.href;
    if (pathname === tab.href || pathname.startsWith(tab.href + '/')) return true;
    if (tab.groupPaths?.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return true;
    }
    return false;
  };

  return (
    <div className='flex flex-wrap gap-1 p-1 rounded-lg bg-muted max-w-full'>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
              active
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className='h-4 w-4' />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
