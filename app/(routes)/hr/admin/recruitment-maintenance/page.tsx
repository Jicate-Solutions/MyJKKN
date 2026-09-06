// ============================================================================
// HR RECRUITMENT — MAINTENANCE (Super-Admin)
// ----------------------------------------------------------------------------
// Director-pressable surface for cleaning up legacy candidates that ended up
// with empty approval chains (submitted before chain-builder was configured).
//
// Flow: pick org → "Run dry-run" → review per-row preview table → tick
// confirmation checkbox → "Apply backfill". No JSONB shown anywhere. Plain
// English consequences only.
//
// Pattern reference: app/(routes)/hr/admin/recruitment-approval-flows/page.tsx
// (guarded ContentLayout wrapper, English-consequence body).
// ============================================================================

export const navMeta = {
  label: 'Recruitment Maintenance',
  icon: 'Wrench',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { RecruitmentMaintenanceClient } from './_components/recruitment-maintenance-client';

export default function HrRecruitmentMaintenancePage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Recruitment — Maintenance">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Recruitment
            maintenance operations can change approval routing for live
            candidates and are locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Recruitment — Maintenance">
        <RecruitmentMaintenanceClient />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
