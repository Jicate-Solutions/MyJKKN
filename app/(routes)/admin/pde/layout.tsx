'use client';

// Tier 3 layout for /admin/pde/* — renders sub-tab strip via AdminCategoryNav.
// Pattern reference: app/(routes)/admission/counselors/team/layout.tsx (PR #603)

import type { ReactNode } from 'react';
import { AdminCategoryNav } from '@/components/admin/AdminCategoryNav';

export default function PdeAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <AdminCategoryNav category="pde" />
      {children}
    </div>
  );
}
