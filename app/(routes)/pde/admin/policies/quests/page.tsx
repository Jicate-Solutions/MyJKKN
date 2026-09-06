// =====================================================================
// /pde/admin/policies/quests — PDE Cluster D admin editor
// =====================================================================
// Edits 4 platform_policies rows that govern PDE quest sourcing — risk
// tiers, supply sources, contributor compensation, and failed-quest
// recovery behavior.
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies (RLS-restricted to super_admin via existing
// policies). Save → toast → effective on next quest sourcing run.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { QuestsPolicyEditor } from './_components/QuestsPolicyEditor';

export const navMeta = {
  label: 'PDE Quests & Supply',
  icon: 'Boxes',
} as const;

export default function PdeQuestsPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Policy — Quests & Supply">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE quest
            policies affect how quests are sourced and how contributors
            are compensated across all institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Policy — Quests & Supply">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Policies' },
            { label: 'Quests & Supply' },
          ]}
        />
        <QuestsPolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
