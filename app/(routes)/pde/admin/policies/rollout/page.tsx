// =====================================================================
// /pde/admin/policies/rollout — PDE Cluster C admin editor
// =====================================================================
// Edits 4 platform_policies rows that govern PDE rollout pace, per-college
// category targets, HOD-block escalation, and course-tier eligibility.
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next coordinator onboarding cycle.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { RolloutPolicyEditor } from './_components/RolloutPolicyEditor';

export const navMeta = {
  label: 'PDE Rollout & Compliance',
  icon: 'Map',
} as const;

export default function PdeRolloutPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policy — Rollout & Compliance">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE rollout
            policies affect onboarding pace and category targets across all
            institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Rollout & Compliance">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Rollout & Compliance' },
          ]}
        />
        <RolloutPolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
