// =====================================================================
// /pde/admin/cohort — PDE Tier 1.3 admin cohort heatmap
// =====================================================================
// Shows the institution × category heatmap of weighted demonstration
// scores. Scoped by the pde.visibility.cohort_comparison_scope policy
// (institution_wide | deans_only | aggregated_only) — the service
// applies the scope; this page just renders.
//
// Director / dean view. Per-college compliance target indicators are
// derived from pde.rollout.per_college_compliance_targets.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { PDECohortService } from '@/lib/services/pde-cohort-service';
import { getPerCollegeComplianceTargets } from '@/lib/services/pde-policy-reader';
import { CohortHeatmap } from './_components/CohortHeatmap';

export const navMeta = {
  label: 'PDE Cohort Comparison',
  icon: 'BarChart3',
} as const;

// Server component — heavy aggregation runs here, not on the client.
export default async function PdeCohortPage() {
  // Both lookups are independent — fetch in parallel.
  const [data, complianceTargets] = await Promise.all([
    PDECohortService.getCohortHeatmap(),
    getPerCollegeComplianceTargets(),
  ]);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Cohort Comparison">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Cohort
            comparison surfaces aggregated demonstration data across
            institutions and is governed by the
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              pde.visibility.cohort_comparison_scope
            </code>
            policy.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Cohort Comparison">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Cohort Comparison' },
          ]}
        />
        <CohortHeatmap data={data} complianceTargets={complianceTargets} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
