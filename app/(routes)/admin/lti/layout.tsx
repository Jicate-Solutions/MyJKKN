'use client';

// Tier 3 layout for /admin/lti/* — renders sub-tab strip via AdminCategoryNav.
// Pattern reference: app/(routes)/admission/counselors/team/layout.tsx (PR #603)

import type { ReactNode } from 'react';
import { AdminCategoryNav } from '@/components/admin/AdminCategoryNav';
// 2026-06-19: gate the LTI admin subtree by each route's declared permission.
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function LtiAdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard>
      <div className="space-y-4">
        <AdminCategoryNav category="lti" />
        {children}
      </div>
    </RoutePermissionGuard>
  );
}
