'use client';

// The InstaSolver desk's tab bar. Tabs appear by the person's relationship to
// the module (from instasolver_my_access), because triage, work and analytics
// are decided by role and team membership in the database — not by a
// permission key the sidebar could read.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// Icons match the InstaSolver rows in the MyJKKN sidebar (lib/sidebarMenuLink.ts):
// one distinct icon per screen.
import {
  ChartPie,
  Drill,
  LayoutPanelLeft,
  ListFilter,
  ListTodo,
  PackageSearch,
  SlidersHorizontal,
  Weight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInstaSolverAccess } from '@/hooks/instasolver/use-instasolver';
import { hasNeed, type AccessNeed } from './access-gate';

const TABS: { href: string; label: string; icon: typeof Weight; need?: AccessNeed }[] = [
  { href: '/instasolver/dashboard', label: 'Dashboard', icon: LayoutPanelLeft },
  { href: '/instasolver/issues', label: 'Issues', icon: ListTodo },
  { href: '/instasolver/requirements', label: 'Requirements', icon: PackageSearch },
  { href: '/instasolver/triage', label: 'Triage queue', icon: ListFilter, need: 'manager' },
  { href: '/instasolver/work', label: 'My work', icon: Drill, need: 'maintenance' },
  { href: '/instasolver/workload', label: 'Workload', icon: Weight, need: 'manager' },
  { href: '/instasolver/analytics', label: 'Analytics', icon: ChartPie, need: 'analytics' },
  { href: '/instasolver/admin', label: 'Administration', icon: SlidersHorizontal, need: 'manager' }
];

export function InstaSolverNav() {
  const pathname = usePathname();
  const { data: access } = useInstaSolverAccess();
  const visible = TABS.filter((t) => !t.need || hasNeed(access, t.need));

  return (
    // Tabs wrap onto a second line rather than scrolling sideways — no
    // horizontal scrollbar under the tab bar.
    <nav aria-label="InstaSolver" className="-mx-1">
      <ul className="flex flex-wrap gap-x-1 border-b px-1">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
