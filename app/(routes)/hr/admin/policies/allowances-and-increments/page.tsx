// ============================================================================
// HR ALLOWANCES & INCREMENTS — Policy Editor (Super-Admin)
// ============================================================================
// Edits the institution-scoped `hr.allowances_and_increments` row.
// Spec: specs/hr-policy-jsonb-structures-2026-05-15.md §11.
// ============================================================================

export const navMeta = {
  label: 'Allowances & Increments',
  icon: 'TrendingUp',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { AllowancesEditor } from './_components/allowances-editor';

export default function HrAllowancesAndIncrementsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Allowances & Increments">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Compensation
            policies are sensitive and locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Allowances & Increments — Per institution governance">
        <AllowancesEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
