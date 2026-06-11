// =====================================================================
// /pde/admin/policies/clinical-reasoning — Director controls for PDE
// Clinical Reasoning (AICBL → PDE port)
// =====================================================================
// Reads 8 platform_policies rows under clinical_reasoning.* and renders
// them via TypedWidgetPolicyEditor — a reusable component that
// dispatches widget type from each row's ui_widget column.
//
// Director + institution_admin only (super_admin guard).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { TypedWidgetPolicyEditor } from './_components/TypedWidgetPolicyEditor';

export const navMeta = {
  label: 'PDE Clinical Reasoning',
  icon: 'Stethoscope',
} as const;

export default function PdeClinicalReasoningPolicyPage() {
  return (
    <PermissionGuard
      module="pde.admin"
      action="view"
      fallback={
        <ContentLayout title="PDE Policy — Clinical Reasoning">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Clinical
            reasoning policies govern the AI tutor, scoring thresholds,
            attempt caps, and accreditation-evidence generation for the
            dental case-based learning module.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Clinical Reasoning">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Clinical Reasoning' },
          ]}
        />
        <TypedWidgetPolicyEditor />
      </ContentLayout>
    </PermissionGuard>
  );
}
