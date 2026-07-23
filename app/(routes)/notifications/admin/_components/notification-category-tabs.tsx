'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Notification } from '@/types/notifications';
import { getCanonicalCategoryLabel } from '@/lib/constants/notification-categories';

/**
 * Humanize an ad-hoc category key (one not in the canonical list).
 * "dashboard:rescue"  → "Dashboard Rescue"
 * "billing_invoice"   → "Billing Invoice"
 */
function prettify(key: string): string {
  if (!key) return 'Uncategorized';
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[:_\-\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

interface NotificationCategoryTabsProps {
  notifications: Notification[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

/**
 * Horizontal scrollable category tabs for filtering notifications.
 *
 * Tab composition:
 *   1. "All" tab always first (total count)
 *   2. All canonical categories from NOTIFICATION_CATEGORIES (shared with the
 *      Send Notification form), shown when count > 0 — labels match the form
 *      dropdown ("Announcement", "Action Required", etc.)
 *   3. Any organic categories emitted by modules (e.g. "Dashboard:Rescue"
 *      from the lead-rescue cron) also appear when present — prettified
 *
 * Sort within (2)+(3): by count descending so the most common surfaces next.
 * Category keys are normalized to lowercase so "Alerts" and "alerts" share
 * a tab.
 */
export function NotificationCategoryTabs({
  notifications,
  activeCategory,
  onCategoryChange
}: NotificationCategoryTabsProps) {
  const categoryTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notifications) {
      const cat = (n.category || 'uncategorized').toLowerCase();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }

    // Sort by count desc, then alphabetically as tiebreaker
    const sorted = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    return [
      { key: 'all', label: 'All', count: notifications.length },
      ...sorted.map(([key, count]) => ({
        key,
        // Prefer canonical label from the shared constant so the tab reads
        // exactly like the form's dropdown option (case-for-case)
        label: getCanonicalCategoryLabel(key) ?? prettify(key),
        count
      }))
    ];
  }, [notifications]);

  return (
    <div className='w-full overflow-x-auto scrollbar-hide -mb-px'>
      <div className='flex items-center gap-1 min-w-max pb-1'>
        {categoryTabs.map((category) => {
          const isActive = activeCategory === category.key;

          return (
            <button
              key={category.key}
              onClick={() => onCategoryChange(category.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              aria-pressed={isActive}
              aria-label={`${category.label} (${category.count})`}
            >
              {category.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full text-[11px] font-semibold min-w-[18px] h-[18px] px-1',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {category.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
