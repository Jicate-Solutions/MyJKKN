// =====================================================================
// /pde/admin/quest-supply — PDE Tier 3.1 admin review UI
// =====================================================================
// Lists proposed quests (status='proposed' in pde_quests) and lets a
// super_admin approve them — flipping status to 'active' so the quest
// shows up in the canonical learner-facing quest list.
//
// Director-only (super_admin). Approval API and policy validation live
// in /api/pde/quest-supply (PATCH ?action=approve), and the policy
// pde.quests.supply_sources is consumed by the submit path inside
// PDEQuestSupplyService.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PDEQuestSupplyService } from '@/lib/services/pde-quest-supply-service';
import { QuestSupplyList } from './_components/QuestSupplyList';

export const dynamic = 'force-dynamic';

export const navMeta = {
  label: 'PDE Quest Supply',
  icon: 'Inbox',
} as const;

export default async function PdeQuestSupplyPage() {
  const proposed = await PDEQuestSupplyService.listProposedQuests().catch(() => []);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Quest Supply — Proposed Quests">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Quest supply
            approvals affect what learners see in the public quest list.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Quest Supply — Proposed Quests">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Quest Supply' },
          ]}
        />
        <div className="mb-4 text-sm text-muted-foreground">
          Industry partners, alumni, and students can propose quests via
          the public submission endpoint. Approved proposals become active
          quests in <code className="rounded bg-muted px-1">pde_quests</code>.
        </div>
        <QuestSupplyList initialRows={proposed} />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
