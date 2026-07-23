// =====================================================================
// /pde/admin/policies/governance — PDE Cluster E admin editor
// =====================================================================
// Edits 4 platform_policies rows that govern PDE gaming defense, 360
// feedback identity, year-1 placement-signal response, and framework
// branding.
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next reporting cycle.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { GovernancePolicyEditor } from './_components/GovernancePolicyEditor';

export const navMeta = {
  label: 'PDE Gamification & Defense',
  icon: 'ShieldCheck',
} as const;

export default function PdeGovernancePolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policy — Gamification & Defense">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE governance
            policies affect gaming defenses, 360 feedback handling, placement
            signal response, and how the framework is publicly branded.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Gamification & Defense">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Gamification & Defense' },
          ]}
        />
        <GovernancePolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
