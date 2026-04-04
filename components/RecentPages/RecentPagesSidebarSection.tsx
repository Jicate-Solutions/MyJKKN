'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, ChevronDown, X } from 'lucide-react';
import { getRecentPages, clearRecentPages, removeRecentPage } from '@/lib/navigation/recent-pages';
import { ICON_MAP } from '@/lib/navigation/page-registry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecentPage } from '@/lib/navigation/types';

interface RecentPagesSidebarSectionProps {
  isOpen: boolean | undefined;
}

/**
 * Collapsible "Recent" section in the sidebar showing last visited pages.
 */
export function RecentPagesSidebarSection({ isOpen }: RecentPagesSidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const pathname = usePathname();

  // Refresh recent pages on route change
  useEffect(() => {
    setRecentPages(getRecentPages(5));
  }, [pathname]);

  if (recentPages.length === 0 || isOpen === false) return null;

  return (
    <div className="px-2 pb-2">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium uppercase tracking-wider',
          'text-muted-foreground hover:text-foreground transition-colors rounded-md',
          'dark:text-gray-400 dark:hover:text-white'
        )}
      >
        <Clock className="h-3 w-3" />
        <span className="flex-1 text-left">Recent</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            !isExpanded && '-rotate-90'
          )}
        />
      </button>

      {/* Recent Pages List */}
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {recentPages.map((page) => {
            const IconComponent = ICON_MAP[page.iconName] || Clock;
            const isActive = pathname === page.path || pathname.startsWith(page.path + '/');
            const timeAgo = getTimeAgo(page.visitedAt);

            return (
              <div key={page.path} className="group relative">
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start h-8 px-3 text-xs',
                    !isActive && 'dark:text-gray-400 hover:dark:text-gray-200'
                  )}
                  asChild
                >
                  <Link href={page.path}>
                    <IconComponent className="h-3.5 w-3.5 mr-2 shrink-0" />
                    <span className="truncate flex-1">{page.title}</span>
                    <span className="text-[9px] text-muted-foreground/50 shrink-0 group-hover:hidden">
                      {timeAgo}
                    </span>
                  </Link>
                </Button>
                {/* Remove on hover */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeRecentPage(page.path);
                    setRecentPages(getRecentPages(5));
                  }}
                  className={cn(
                    'absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5',
                    'items-center justify-center rounded-sm',
                    'hover:bg-destructive/10 text-muted-foreground hover:text-destructive',
                    'transition-colors hidden group-hover:flex'
                  )}
                  title="Remove from recent"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Separator */}
      <div className="mt-2 mx-3 border-b border-border/50 dark:border-gray-700/40" />
    </div>
  );
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}
