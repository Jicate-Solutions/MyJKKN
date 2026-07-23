// =====================================================================
// /pde/admin/rubrics/cultural-civic — PDE Phase 9 (NEP-aligned) editor
// =====================================================================
// Edits 4 platform_policies rows that govern the Cultural & Civic Literacy
// slice of the PDE score. Mirrors NEP 2020 §4.6-4.7, §4.23, §11.8 — and
// JKKN's Tamil-Nadu rootedness (Tamil = primary approved language,
// panchayat / SHG contexts, classical + folk tradition domains).
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next demonstration submission.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { CulturalCivicRubricEditor } from './_components/CulturalCivicRubricEditor';

export const navMeta = {
  label: 'PDE Rubrics — Cultural & Civic',
  icon: 'BookHeart',
} as const;

export default function PdeCulturalCivicRubricPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Rubrics — Cultural & Civic Literacy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Cultural &amp;
            civic rubrics affect how every PDE demonstration is graded for
            language, community-project, tradition, and civic-engagement
            credit.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Rubrics — Cultural & Civic Literacy">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Rubrics' },
            { label: 'Cultural & Civic Literacy' },
          ]}
        />
        <CulturalCivicRubricEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
