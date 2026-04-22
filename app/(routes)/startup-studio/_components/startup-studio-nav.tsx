'use client';

/**
 * Startup Studio Module Navigation
 *
 * Top-level tab bar rendered by startup-studio/layout.tsx on every Startup
 * Studio page. Mirrors the Learners Council / Campus Living / Admission CRM
 * pattern:
 *   Tier 1 (this file): Startup Studio module tabs
 *   Tier 2: SectionSubNav per section (e.g. /solve-for-100 and
 *           /events/[id] render their own SectionSubNav via layout.tsx)
 *
 * URLs are kept UNCHANGED — no bookmarks break.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gauge,
  Users,
  Award,
  PieChart,
  Megaphone,
  Wallet,
  Scale,
  Target,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StartupStudioTab {
  href: string;
  icon: typeof Gauge;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

const tabs: StartupStudioTab[] = [
  { href: '/startup-studio/portfolio', icon: Gauge, label: 'Portfolio' },
  { href: '/startup-studio/mentors', icon: Users, label: 'Mentors' },
  { href: '/startup-studio/alumni', icon: Award, label: 'Alumni' },
  { href: '/startup-studio/kpi', icon: PieChart, label: 'KPI' },
  { href: '/startup-studio/marketing', icon: Megaphone, label: 'Marketing' },
  { href: '/startup-studio/finance', icon: Wallet, label: 'Finance' },
  { href: '/startup-studio/governance', icon: Scale, label: 'Governance' },
  { href: '/startup-studio/solve-for-100', icon: Target, label: 'Solve for 100' },
  { href: '/startup-studio/events', icon: Rocket, label: 'Events' },
];

export function StartupStudioNav() {
  const pathname = usePathname();

  const isActive = (tab: StartupStudioTab) => {
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
