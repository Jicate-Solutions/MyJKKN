'use client';

/**
 * Solution Hub Module Navigation
 *
 * Top-level tab bar rendered by solutions/layout.tsx on every Solutions page.
 * Mirrors the Learners Council / Campus Living / Admission CRM pattern:
 *   Tier 1 (this file): Solution Hub module tabs — grouped by workflow
 *   Tier 2: SectionSubNav per section (e.g. /solutions/pipeline shows peer
 *           tabs like Board View, List View, Analytics; /solutions/training
 *           shows peer tabs like Overview, Programs, Sessions, Cohort)
 *
 * URLs are kept UNCHANGED — no bookmarks break. Grouping is expressed via
 * `groupPaths` so a top-level tab stays active across peer routes.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Workflow,
  Users,
  Hammer,
  GraduationCap,
  FileText,
  Wallet,
  Compass,
  Package,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SolutionsTab {
  href: string;
  icon: typeof LayoutGrid;
  label: string;
  /** Active only on exact pathname match */
  exact?: boolean;
  /** Additional paths that count as "inside this tab's group" */
  groupPaths?: string[];
}

const tabs: SolutionsTab[] = [
  {
    href: '/solutions',
    icon: LayoutGrid,
    label: 'Dashboard',
    exact: true,
  },
  {
    href: '/solutions/pipeline',
    icon: Workflow,
    label: 'Pipeline',
  },
  {
    href: '/solutions/clients',
    icon: Users,
    label: 'Clients',
  },
  {
    href: '/solutions/builders',
    icon: Hammer,
    label: 'Builders',
    groupPaths: ['/solutions/builders'],
  },
  {
    href: '/solutions/training',
    icon: GraduationCap,
    label: 'Training',
  },
  {
    href: '/solutions/content',
    icon: FileText,
    label: 'Content',
  },
  {
    href: '/solutions/payments',
    icon: Wallet,
    label: 'Payments',
    groupPaths: ['/solutions/payments', '/solutions/earnings'],
  },
  {
    href: '/solutions/discovery',
    icon: Compass,
    label: 'Discovery',
    groupPaths: ['/solutions/discovery', '/solutions/publications'],
  },
  {
    href: '/solutions/products',
    icon: Package,
    label: 'Products',
    groupPaths: ['/solutions/products', '/solutions/matlab', '/solutions/software'],
  },
  {
    href: '/solutions/paradigm-shift',
    icon: Lightbulb,
    label: 'More',
    groupPaths: ['/solutions/paradigm-shift', '/solutions/ai-solution-compliance'],
  },
];

export function SolutionsNav() {
  const pathname = usePathname();

  const isActive = (tab: SolutionsTab) => {
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
