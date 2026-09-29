'use client';

/**
 * Who may open the appraisal round pages.
 *
 * A super admin, or anyone given `hr.performance_reviews.manage` (typically
 * HR). Anyone else sees the standard "you don't have access" notice naming
 * the permission — never a blank page.
 *
 * What the key does NOT open: creating rounds, moving a round between
 * stages, the committee review and the Director's sign-off. Those stay
 * super-admin only inside the pages (wrapped in <SuperAdminOnly> there), as
 * they were in #4081. The key adds the checks on the appraisal itself — the
 * agreement report, the spread warning, the conditions count — and asking for
 * a blind second rater.
 */

import type { ReactNode } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';

export const APPRAISAL_HR_MODULE = 'hr.performance_reviews';
export const APPRAISAL_HR_ACTION = 'manage';

export function AppraisalHrGate({ children }: { children: ReactNode }) {
  return (
    <PermissionGuard module={APPRAISAL_HR_MODULE} action={APPRAISAL_HR_ACTION}>
      {children}
    </PermissionGuard>
  );
}
