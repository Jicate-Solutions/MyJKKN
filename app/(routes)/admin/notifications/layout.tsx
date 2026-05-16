'use client';

// Tier 3 layout for /admin/notifications/* — renders sub-tab strip via AdminCategoryNav.
// Pattern reference: app/(routes)/admission/counselors/team/layout.tsx (PR #603)

import type { ReactNode } from 'react';
import { AdminCategoryNav } from '@/components/admin/AdminCategoryNav';

export default function NotificationsAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <AdminCategoryNav category="notifications" />
      {children}
    </div>
  );
}
