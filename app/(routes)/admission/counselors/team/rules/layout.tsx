'use client';

// Manage-tier guard for /admission/counselors/team/rules.
//
// The parent team/layout.tsx gates section ENTRY on
// `admission.counselors.team.view`, so leaders with view-only access
// (Principal / HOD) can see the team shell + roster/activity. Editing
// assignment RULES is a management action, so this nested layout additionally
// requires `admission.counselors.team.manage`. View-only leaders get an
// explicit message (not a blank page) per CLAUDE.md rule #27 — permission
// failures must be explicit, never silent.

import type { ReactNode } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function RulesManageLayout({ children }: { children: ReactNode }) {
  return (
    <PermissionGuard
      module="admission.counselors.team"
      action="manage"
      fallback={
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          You have view-only access to counselor teams. Editing assignment rules
          requires Admission Manager access.
        </div>
      }
    >
      {children}
    </PermissionGuard>
  );
}
