// app/(routes)/meetings/series/_components/series-tab-bar.tsx
//
// The two-tab strip shared by the recurring-series screens: the series
// themselves (piece 1) and the scheduling rules they are read against (piece 2).
//
// Lives in _components rather than in page.tsx because Next's App Router treats
// a page file's exports as route config — a component exported from page.tsx is
// the kind of thing that compiles today and breaks on an upgrade.

import Link from 'next/link';
import { Repeat, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'series', label: 'Series', href: '/meetings/series', icon: Repeat },
  {
    key: 'rules',
    label: 'Scheduling rules',
    href: '/meetings/series/rules',
    icon: SlidersHorizontal,
  },
] as const;

export function SeriesTabBar({ active }: { active: 'series' | 'rules' }) {
  return (
    <nav
      aria-label="Recurring series sections"
      className="flex flex-wrap gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
