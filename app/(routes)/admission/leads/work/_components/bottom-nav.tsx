'use client';

import { Home, Users, Phone, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Tab = 'today' | 'leads' | 'call' | 'tasks';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  pendingTasks?: number;
  pendingLeads?: number;
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
];

export function BottomNav({
  activeTab,
  onTabChange,
  pendingTasks,
  pendingLeads,
}: BottomNavProps) {
  function getBadgeCount(tabId: Tab): number | undefined {
    if (tabId === 'leads') return pendingLeads;
    if (tabId === 'tasks') return pendingTasks;
    return undefined;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeCount = getBadgeCount(tab.id);

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={
                badgeCount && badgeCount > 0
                  ? `${tab.label}, ${badgeCount} pending`
                  : tab.label
              }
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-primary/70'
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                {badgeCount != null && badgeCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-0 px-1 py-0 text-[10px] leading-none"
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </Badge>
                )}
              </span>
              <span className="text-[10px] font-medium leading-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
