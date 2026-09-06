// ============================================================================
// HR PAY SCALES — Policy Editor (Super-Admin)
// ============================================================================
// Edits the institution-scoped `hr.pay_scales` row in platform_policies.
// Director's view: an editable pay matrix (designation × qualification → basic_pay)
// rather than raw JSONB. Super-admin only — pay is sensitive.
//
// Seeded by migrations/20260605_hr_compensation_seeds.sql (Wave 3 — M4).
// Spec: specs/hr-policy-jsonb-structures-2026-05-15.md §10.
// ============================================================================

export const navMeta = {
  label: 'Pay Scales',
  icon: 'Banknote',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PayScalesEditor } from './_components/pay-scales-editor';

export default function HrPayScalesPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Pay Scales">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Pay-scale data is
            sensitive and locked tight to prevent accidental exposure.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Pay Scales — Per institution basic-pay matrix">
        <PayScalesEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
