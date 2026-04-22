'use client';

/**
 * Admission CRM Module Navigation
 *
 * Top-level tab bar rendered by admission/layout.tsx on every Admission page.
 * Mirrors the Learners Council / Campus Living pattern:
 *   Tier 1 (this file): Admission module tabs — grouped by workflow
 *   Tier 2: SectionSubNav per section (e.g. /admission/marketing shows peer
 *           tabs like Campaigns, Chat, Voice, Expos; /admission/counselors
 *           shows peer tabs like Daily View, Call Logs, Reminders)
 *
 * URLs are kept UNCHANGED — no bookmarks break. Grouping is expressed via
 * `groupPaths` so a top-level tab stays active across peer routes.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  LineChart,
  UserPlus,
  Award,
  HeadphonesIcon,
  Megaphone,
  Sparkles,
  SearchCheck,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdmissionTab {
  href: string;
  icon: typeof LayoutGrid;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

const tabs: AdmissionTab[] = [
  {
    href: '/admission/dashboard',
    icon: LayoutGrid,
    label: 'Dashboard',
    groupPaths: ['/admission'],
  },
  {
    href: '/admission/analytics',
    icon: LineChart,
    label: 'Analytics',
    groupPaths: ['/admission/analytics', '/admission/group-dashboard'],
  },
  {
    href: '/admission/leads',
    icon: UserPlus,
    label: 'Leads',
    groupPaths: ['/admission/leads', '/admission/applications'],
  },
  {
    href: '/admission/gd-pi',
    icon: Award,
    label: 'GD-PI',
  },
  {
    href: '/admission/counselors',
    icon: HeadphonesIcon,
    label: 'Counselors',
    groupPaths: ['/admission/counselors', '/admission/consultants'],
  },
  {
    href: '/admission/marketing',
    icon: Megaphone,
    label: 'Marketing',
  },
  {
    href: '/admission/insights',
    icon: Sparkles,
    label: 'AI Insights',
  },
  {
    href: '/admission/data-quality',
    icon: SearchCheck,
    label: 'Data Quality',
  },
  {
    href: '/admission/settings',
    icon: Settings,
    label: 'Settings',
  },
];

export function AdmissionNav() {
  const pathname = usePathname();

  const isActive = (tab: AdmissionTab) => {
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
