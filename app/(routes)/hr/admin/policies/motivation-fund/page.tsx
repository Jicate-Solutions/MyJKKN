// ============================================================================
// HR MOTIVATION FUND — Policy Editor (Super-Admin)
// ============================================================================
// Edits the institution-scoped `hr.motivation_fund` row.
// EPF + awards + consultancy framing per HR manual.
// Spec: specs/hr-policy-jsonb-structures-2026-05-15.md §16.
// ============================================================================

export const navMeta = {
  label: 'Motivation Fund',
  icon: 'Trophy',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { MotivationFundEditor } from './_components/motivation-fund-editor';

export default function HrMotivationFundPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Motivation Fund">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. EPF contribution
            rates and award policies are sensitive.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Motivation Fund — EPF, awards, consultancy">
        <MotivationFundEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
