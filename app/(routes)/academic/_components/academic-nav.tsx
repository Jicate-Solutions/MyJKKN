'use client';

/**
 * Academic Management Module Navigation
 *
 * Top-level tab bar rendered by academic/layout.tsx on every Academic page.
 * Mirrors the Learners Council / Campus Living / Admission CRM pattern:
 *   Tier 1 (this file): Academic module tabs — one per section
 *   Tier 2: SectionSubNav per section (e.g. /academic/leaves shows peer tabs
 *           All Leaves / Leave Types / Approval Workflows; /academic/attendance
 *           shows peer tabs Dashboard / Pending / Mark / Reports / Consolidation)
 *
 * URLs are kept UNCHANGED — no bookmarks break. Grouping is expressed via
 * `groupPaths` so a top-level tab stays active across peer routes.
 *
 * HIGH-TRAFFIC MODULE: timetables, attendance, periods are used daily by faculty.
 * Deep-linked URLs must continue to work; this file only changes navigation chrome.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Bookmark,
  Boxes,
  Clock,
  CalendarClock,
  ClipboardCheck,
  CalendarX2,
  UserSearch,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AcademicTab {
  href: string;
  icon: typeof CalendarDays;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

const tabs: AcademicTab[] = [
  {
    href: '/academic/years',
    icon: CalendarDays,
    label: 'Years',
    groupPaths: ['/academic/years'],
  },
  {
    href: '/academic/regulations',
    icon: Bookmark,
    label: 'Regulations',
    groupPaths: ['/academic/regulations'],
  },
  {
    href: '/academic/batches',
    icon: Boxes,
    label: 'Batches',
    groupPaths: ['/academic/batches'],
  },
  {
    href: '/academic/periods',
    icon: Clock,
    label: 'Periods',
    groupPaths: ['/academic/periods'],
  },
  {
    href: '/academic/timetables',
    icon: CalendarClock,
    label: 'Timetables',
    groupPaths: ['/academic/timetables'],
  },
  {
    href: '/academic/attendance',
    icon: ClipboardCheck,
    label: 'Attendance',
    groupPaths: ['/academic/attendance'],
  },
  {
    href: '/academic/leaves',
    icon: CalendarX2,
    label: 'Leaves',
    groupPaths: [
      '/academic/leaves',
      '/academic/leave-calendar',
      '/academic/leave-onduty',
    ],
  },
  {
    href: '/academic/staff-planning',
    icon: UserSearch,
    label: 'Planning',
  },
  {
    href: '/academic/privileges',
    icon: Shield,
    label: 'Privileges',
    groupPaths: ['/academic/privileges'],
  },
];

export function AcademicNav() {
  const pathname = usePathname();

  const isActive = (tab: AcademicTab) => {
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
