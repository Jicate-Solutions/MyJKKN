'use client';

import { cn } from '@/lib/utils';
import { Notification } from '@/types/notifications';

// Category configuration
export const NOTIFICATION_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'events', label: 'Events' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'general', label: 'General' }
] as const;

export type CategoryKey = (typeof NOTIFICATION_CATEGORIES)[number]['key'];

interface NotificationCategoryTabsProps {
  notifications: Notification[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

/**
 * Horizontal scrollable category tabs for filtering notifications.
 *
 * Usage:
 * <NotificationCategoryTabs
 *   notifications={notifications}
 *   activeCategory={activeCategory}
 *   onCategoryChange={setActiveCategory}
 * />
 */
export function NotificationCategoryTabs({
  notifications,
  activeCategory,
  onCategoryChange
}: NotificationCategoryTabsProps) {
  const getCategoryCount = (categoryKey: string) => {
    if (categoryKey === 'all') return notifications.length;
    return notifications.filter((n) => n.category === categoryKey).length;
  };

  return (
    <div className='w-full overflow-x-auto scrollbar-hide -mb-px'>
      <div className='flex items-center gap-1 min-w-max pb-1'>
        {NOTIFICATION_CATEGORIES.map((category) => {
          const count = getCategoryCount(category.key);
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
              aria-label={`${category.label} (${count})`}
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
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
