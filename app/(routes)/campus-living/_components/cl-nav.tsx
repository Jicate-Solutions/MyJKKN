'use client';

/**
 * Campus Living Module Navigation
 *
 * Top-level tab bar rendered by campus-living/layout.tsx on every CL page.
 * Mirrors the Learners Council pattern (see ../../learners-council/lc-nav.tsx):
 *   Tier 1 (this file): CL module tabs — grouped by workflow
 *   Tier 2: SectionSubNav per section (e.g. /campus-living/mess shows peers
 *           Laundry + Housekeeping; /campus-living/attendance shows peers
 *           Leave + Gate Passes + Visitors)
 *
 * URLs are kept FLAT (e.g. /campus-living/mess, not /campus-living/services/mess)
 * to preserve existing bookmarks. The grouping is expressed via the top-level
 * tab's `matchPaths` — a tab is active if pathname matches the anchor OR any
 * peer route.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  LayoutDashboard,
  UsersRound,
  UserCheck,
  UtensilsCrossed,
  Wrench,
  Users,
  BarChart3,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CLTab {
  href: string;
  icon: typeof Home;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

/**
 * 9 top-level tabs — matches LC's count. URLs point to section anchors.
 * Each group's `groupPaths` lets the top tab stay active as the user
 * navigates between peer pages inside that group.
 */
const tabs: CLTab[] = [
  {
    href: '/campus-living',
    icon: Home,
    label: 'Overview',
    exact: true,
  },
  {
    href: '/campus-living/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    exact: true,
  },
  {
    href: '/campus-living/residents',
    icon: UsersRound,
    label: 'Residents',
    groupPaths: [
      '/campus-living/blocks',
      '/campus-living/residents',
      '/campus-living/allocations',
    ],
  },
  {
    href: '/campus-living/attendance',
    icon: UserCheck,
    label: 'Attendance',
    groupPaths: [
      '/campus-living/attendance',
      '/campus-living/leave',
      '/campus-living/gate-passes',
      '/campus-living/visitors',
    ],
  },
  {
    href: '/campus-living/mess',
    icon: UtensilsCrossed,
    label: 'Services',
    groupPaths: [
      '/campus-living/mess',
      '/campus-living/laundry',
      '/campus-living/housekeeping',
    ],
  },
  {
    href: '/campus-living/maintenance',
    icon: Wrench,
    label: 'Facility',
    groupPaths: [
      '/campus-living/maintenance',
      '/campus-living/safety',
      '/campus-living/wellness',
      '/campus-living/health',
    ],
  },
  {
    href: '/campus-living/community',
    icon: Users,
    label: 'Community',
    groupPaths: [
      '/campus-living/community',
      '/campus-living/activity',
      '/campus-living/calendar',
    ],
  },
  {
    href: '/campus-living/analytics',
    icon: BarChart3,
    label: 'Insights',
    groupPaths: ['/campus-living/analytics', '/campus-living/reports'],
  },
  {
    href: '/campus-living/settings',
    icon: Settings,
    label: 'Settings',
  },
];

export function CLNav() {
  const pathname = usePathname();

  const isActive = (tab: CLTab) => {
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
