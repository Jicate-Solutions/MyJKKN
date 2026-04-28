'use client';

// team-nav.tsx
// In-page 5-tab navigator for /admission/counselors/team.
// Pattern mirrors app/(routes)/application-hub/api-guidelines/_components/api-nav.tsx
// (the canonical in-page tab primitive used in this codebase).
// Sidebar stays FLAT — one entry per module (per feedback_sidebar_nesting_is_wrong_layer.md).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Users, CalendarDays, Building2, ListFilter, Activity } from 'lucide-react';

const TEAM_NAV_ITEMS = [
  {
    title: 'Members',
    href: '/admission/counselors/team',
    icon: Users,
    description: 'Counselor roster & status',
  },
  {
    title: 'Roster',
    href: '/admission/counselors/team/roster',
    icon: CalendarDays,
    description: '7-day availability grid',
  },
  {
    title: 'Allocation',
    href: '/admission/counselors/team/allocation',
    icon: Building2,
    description: 'Institution & source mapping',
  },
  {
    title: 'Rules',
    href: '/admission/counselors/team/rules',
    icon: ListFilter,
    description: 'Assignment rules (read-only)',
  },
  {
    title: 'Activity',
    href: '/admission/counselors/team/activity',
    icon: Activity,
    description: 'Cascade & audit log',
  },
] as const;

export type TeamNavItem = (typeof TEAM_NAV_ITEMS)[number];

interface TeamNavProps {
  className?: string;
}

export function TeamNav({ className }: TeamNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Team management tabs"
      className={cn('mb-6 flex flex-wrap items-center gap-1', className)}
    >
      {TEAM_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        // Members tab: exact match; others: startsWith
        const isActive =
          item.href === '/admission/counselors/team'
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Button
            key={item.href}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            asChild
            aria-current={isActive ? 'page' : undefined}
          >
            <Link href={item.href}>
              <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
              {item.title}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
