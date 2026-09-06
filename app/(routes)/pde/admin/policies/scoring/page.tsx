// =====================================================================
// /pde/admin/policies/scoring — PDE Cluster A admin editor
// =====================================================================
// Edits 4 platform_policies rows that govern PDE demonstration scoring,
// peer bias detection, validator audits, and AI deliverable credit.
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next demonstration submission.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { ScoringPolicyEditor } from './_components/ScoringPolicyEditor';

export const navMeta = {
  label: 'PDE Scoring & Integrity',
  icon: 'Sliders',
} as const;

export default function PdeScoringPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policy — Scoring & Integrity">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE scoring
            policies affect how demonstrations are graded across all
            institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Scoring & Integrity">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Scoring & Integrity' },
          ]}
        />
        <ScoringPolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
