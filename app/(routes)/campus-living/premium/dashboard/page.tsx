// ============================================================================
// PREMIUM ROOM — DASHBOARD (Super-Admin / Director view)
// ============================================================================
// Created: 2026-05-16
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#14)
//
// 3-tab reporting page for the Premium Room paid SKU:
//   Tab 1: Revenue + Adoption   (Director view) — totals across all colleges
//   Tab 2: Per-college Heatmap  (Ops view)      — fill-rate / tier mix
//   Tab 3: Activity Log         (Audit view)    — recent state transitions
//
// Phase 1: data-tables backed by Phase 1 service queries (counts by tier,
// allocations join). Phase 2: wires the audit_logs activity feed + invoice
// revenue join once those subsystems land.
// ============================================================================

export const navMeta = { label: 'Premium Room Dashboard', icon: 'LayoutGrid' } as const;

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PremiumDashboardTabs } from './_components/premium-dashboard-tabs';

export default function PremiumStayDashboardPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Premium Room Dashboard">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This dashboard is restricted to super administrators. Chief wardens
            see the same data scoped to their college via the Campus Living
            admin panel.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Premium Room Dashboard">
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold">What does this show?</h3>
          <p className="text-sm text-muted-foreground">
            The Premium Room SKU rolled out post-launch. Use this dashboard to
            verify the Q0 metric — incremental premium fee revenue ₹15L by
            day-90 (kill threshold ₹5L). The three tabs separate the
            Director-level revenue view from the ops fill-rate view and the
            audit-trail activity log.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Phase 1 ships with adoption + per-college tier mix. Revenue ₹
            calculations and audit-trail rows wire in Phase 2 once the payment
            gateway integration and audit_logs module='campus_living_premium'
            seed land.
          </p>
        </div>
        <Suspense fallback={null}>
          <PremiumDashboardTabs />
        </Suspense>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
