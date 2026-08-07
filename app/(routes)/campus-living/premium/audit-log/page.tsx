// ============================================================================
// PREMIUM ROOM — AUDIT LOG VIEWER (Super-Admin / Chief-Warden view)
// ============================================================================
// Created: 2026-05-19 (Phase 2)
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#14 — Tab 3)
//
// Per-event audit log of premium-tier state transitions captured by the
// trg_hostel_premium_audit trigger on hostel_allocations (installed in
// 20260519101705). Filters: learner, tier, event_type, date range, text.
//
// Companion service: lib/services/campus-living/hostel-premium-audit-service.ts
// ============================================================================

export const navMeta = { label: 'Premium Room — Audit Log', icon: 'History' } as const;

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { AuditLogViewer } from './_components/audit-log-viewer';

const VIEW_ROLES = [
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ADMINISTRATOR,
  'chief_warden',
  'warden',
];

export default function PremiumStayAuditLogPage() {
  return (
    <AdminPermissionGuard
      adminRoles={VIEW_ROLES}
      fallback={
        <ContentLayout title="Premium Room — Audit Log">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to chief wardens, wardens, and platform
            administrators. The audit log is the auditable backbone of the
            Premium Room SKU — every tier change, room move, and chief warden
            override leaves a row here.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Premium Room — Audit Log">
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold">What this shows</h3>
          <p className="text-sm text-muted-foreground">
            Every premium-tier state transition recorded by the database:
            tier moves, room / bed swaps, status flips, fee status flips, and{' '}
            <strong>chief warden overrides</strong>. Each row names the actor,
            captures before / after, and (for overrides) shows the recorded
            reason.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the filters to narrow by event class (e.g. "show only override
            events from last 7 days"), by tier (Premium vs Premium+), or by
            free-text search across learner names, actors, and reasons. Visit
            the{' '}
            <Link
              href="/campus-living/premium/override"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              override page
            </Link>{' '}
            to apply a new override.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Note: standard-tier opt-ins are intentionally excluded by the
            trigger to keep the log focused. Premium / Premium+ allocations are
            captured from creation onwards.
          </p>
        </div>
        <AuditLogViewer />
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
