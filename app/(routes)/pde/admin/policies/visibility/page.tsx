// =====================================================================
// /pde/admin/policies/visibility — PDE Cluster B admin editor
// =====================================================================
// Edits 4 platform_policies rows that govern when learners see their
// Agency Index, how cohort comparisons are scoped, how capability
// certifications age, and what each learner sees about their own
// metrics (numeric score, percentile, audit trail).
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next learner view.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { VisibilityPolicyEditor } from './_components/VisibilityPolicyEditor';

export const navMeta = {
  label: 'PDE Visibility & Transparency',
  icon: 'Eye',
} as const;

export default function PdeVisibilityPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policy — Visibility & Transparency">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE visibility
            policies affect what learners and faculty see across all
            institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Visibility & Transparency">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Visibility & Transparency' },
          ]}
        />
        <VisibilityPolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
