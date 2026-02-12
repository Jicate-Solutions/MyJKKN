'use client';

/**
 * Learners Council Navigation Tabs
 * Client component that highlights the active tab based on current pathname.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Crown,
  Network,
  Megaphone,
  CalendarCheck,
  ClipboardSignature,
  Vote,
  Kanban,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { value: 'dashboard', href: '/learners-council', icon: Crown, label: 'Dashboard', exact: true },
  { value: 'structure', href: '/learners-council/structure', icon: Network, label: 'Structure' },
  { value: 'communication', href: '/learners-council/communication', icon: Megaphone, label: 'Communication' },
  { value: 'events', href: '/learners-council/events', icon: CalendarCheck, label: 'Events' },
  { value: 'od', href: '/learners-council/od', icon: ClipboardSignature, label: 'OD' },
  { value: 'selection', href: '/learners-council/selection', icon: Vote, label: 'Selection', conditional: true },
  { value: 'issues', href: '/learners-council/issues', icon: Kanban, label: 'Issues' },
  { value: 'settings', href: '/learners-council/settings', icon: Settings, label: 'Settings' },
];

export function LCNav({ showSelectionTab }: { showSelectionTab: boolean }) {
  const pathname = usePathname();

  const isActive = (tab: typeof tabs[0]) => {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  };

  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted max-w-full">
      {tabs.map((tab) => {
        if (tab.conditional && !showSelectionTab) return null;
        const Icon = tab.icon;
        const active = isActive(tab);
        return (
          <Link
            key={tab.value}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
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
