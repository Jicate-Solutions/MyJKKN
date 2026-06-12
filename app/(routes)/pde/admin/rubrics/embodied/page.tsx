// =====================================================================
// /pde/admin/rubrics/embodied — PDE Phase 7 admin editor
// =====================================================================
// Edits 5 platform_policies rows under pde.rubrics.embodied.* — one per
// JKKN college discipline that emphasizes embodied (hands-on) practice:
// Medical, Pharmacy, Nursing, Dental, Engineering.
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next demonstration submission.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { EmbodiedRubricEditor } from './_components/EmbodiedRubricEditor';

export const navMeta = {
  label: 'PDE Embodied Practice Rubrics',
  icon: 'Activity',
} as const;

export default function PdeEmbodiedRubricsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Rubrics — Embodied Practice (Phase 7)">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Embodied
            practice rubrics govern how hands-on demonstrations
            (clinical skills, lab work, prototype builds) are validated
            across all institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Rubrics — Embodied Practice (Phase 7)">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Rubrics' },
            { label: 'Embodied Practice' },
          ]}
        />
        <EmbodiedRubricEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
