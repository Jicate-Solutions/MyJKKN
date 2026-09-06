// =====================================================================
// /pde/admin/placement-signals — PDE Tier 3 (T3.6) placement-team surface
// =====================================================================
// Lists learners crossing the placement-signal threshold (3+ scored PDE
// demonstration categories). Placement staff can manually fire a briefing
// via the action button — the API decides whether to email partners or
// dashboard-only based on `pde.governance.placement_signal_response`.
//
// Director-only (super_admin). The action runs against the public REST
// surface which is auth-gated; the dashboard rows are pre-filtered by the
// service so all 8 institutions' rows are visible from a single page.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PlacementSignalsTable } from './_components/placement-signals-table';

export const navMeta = {
  label: 'PDE Placement Signals',
  icon: 'Megaphone',
} as const;

export default function PdePlacementSignalsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Placement Signals">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. It surfaces
            learners ready for active employer briefings.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Placement Signals">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Placement Signals' },
          ]}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          Learners with passed demonstrations in 3+ PDE categories. Triggering
          a briefing reads <code>pde.governance.placement_signal_response</code>
          to decide whether to email industry partners or dashboard-only.
        </p>
        <PlacementSignalsTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
