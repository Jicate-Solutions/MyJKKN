'use client';

/**
 * Dashboard v2 — Tab title badge
 *
 * Updates document.title to show unread queue count — the WhatsApp-style
 * engagement trigger ("MyJKKN (7)" pulls users back even when MyJKKN is closed).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.1 (Tab badge in spec intent)
 * Round 0.3 decision: bell shows queue items inline; tab title is the
 * subtle 24/7 reminder.
 *
 * Usage (in server page):
 *   const counts = await getQueueCounts();
 *   <TabTitleBadge count={counts.total} baseTitle="MyJKKN · Dashboard" />
 *
 * Polls via Server Action revalidation tick (no additional fetch loop here —
 * Next.js revalidate=30 on the parent page refreshes the prop).
 */

import { useEffect, useRef } from 'react';

type TabTitleBadgeProps = {
  count: number;
  /** Title to append the badge to (e.g. "MyJKKN · Dashboard") */
  baseTitle?: string;
};

export function TabTitleBadge({
  count,
  baseTitle = 'MyJKKN · Dashboard'
}: TabTitleBadgeProps) {
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    // Remember the original title only once, so we can restore it on unmount
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }

    const badge = count > 0 ? ` (${count > 99 ? '99+' : count})` : '';
    document.title = `${baseTitle}${badge}`;

    return () => {
      // Restore when this page unmounts (user navigates away)
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    };
  }, [count, baseTitle]);

  return null; // zero-UI, side-effect only
}
