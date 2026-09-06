// =====================================================================
// /pde/admin/compliance/per-college — PDE Tier 2.4
// =====================================================================
// Renders the 8-college × 7-category compliance matrix. Each college
// row shows the categories it targets (per
// `pde.rollout.per_college_compliance_targets`) versus the actual
// demonstration pass rate. Director / dean view.
//
// Aggregation runs in `PDEComplianceService.getPerCollegeCompliance`
// — this server component is just a thin shell + auth guard.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { PDEComplianceService } from '@/lib/services/pde-compliance-service';
import { ComplianceMatrix } from './_components/ComplianceMatrix';

export const navMeta = {
  label: 'PDE Per-College Compliance',
  icon: 'ShieldCheck',
} as const;

export default async function PdePerCollegeCompliancePage() {
  const data = await PDEComplianceService.getPerCollegeCompliance();

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Per-College Compliance">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Per-college
            compliance surfaces demonstration pass rates against the targets
            in
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              pde.rollout.per_college_compliance_targets
            </code>
            .
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Per-College Compliance">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Compliance' },
            { label: 'Per-College' },
          ]}
        />
        <ComplianceMatrix data={data} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
