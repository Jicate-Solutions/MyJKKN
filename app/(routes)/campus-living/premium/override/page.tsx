// ============================================================================
// PREMIUM ROOM — CHIEF WARDEN OVERRIDE (Super-Admin / Chief-Warden view)
// ============================================================================
// Created: 2026-05-19 (Phase 2)
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#13)
//
// Lists current premium / premium_plus allocations across colleges (RLS-scoped)
// and lets a chief warden (or super_admin / admin) override the learner's
// pick. The override path requires a non-empty free-text reason — enforced
// by the RLS policy in 20260516131807 + by the override service.
//
// Companion service: lib/services/campus-living/hostel-premium-audit-service.ts
// Companion migration: supabase/migrations/20260519101705_create_hostel_premium_audit_log.sql
// ============================================================================

export const navMeta = { label: 'Premium Room — Chief Warden Override', icon: 'ShieldCheck' } as const;

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';
import { OverrideAllocationsTable } from './_components/override-allocations-table';

const OVERRIDE_ROLES = [
  SYSTEM_ROLES.SUPER_ADMIN,
  SYSTEM_ROLES.ADMINISTRATOR,
  'chief_warden',
  'warden',
];

export default function PremiumStayOverridePage() {
  return (
    <AdminPermissionGuard
      adminRoles={OVERRIDE_ROLES}
      fallback={
        <ContentLayout title="Premium Room — Chief Warden Override">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to chief wardens, wardens, and platform
            administrators. The override path additionally requires the{' '}
            <code>campus_living.premium.override_pick</code> permission to
            actually write a change — without it, the override dialog will be
            rejected by the database.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Premium Room — Chief Warden Override">
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold">When to use this page</h3>
          <p className="text-sm text-muted-foreground">
            Chief wardens use this page to <strong>forcibly re-allocate</strong> a
            premium learner — move them to a different block, room, or bed,
            or change their tier. The action requires a written reason
            (mandatory) which is recorded permanently in the audit log.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Typical reasons: medical accommodation, disciplinary action,
            roommate conflict resolution, block closure for renovation, parent
            request escalation. Every override leaves an entry in the{' '}
            <Link
              href="/campus-living/premium/audit-log"
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              audit log
            </Link>{' '}
            with actor, before/after, and reason — visible to all chief wardens
            and platform admins.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Standard-tier allocations are not shown here — only{' '}
            <code>premium</code> and <code>premium_plus</code> currently active.
          </p>
        </div>
        <OverrideAllocationsTable />
      </ContentLayout>
    </AdminPermissionGuard>
  );
}
