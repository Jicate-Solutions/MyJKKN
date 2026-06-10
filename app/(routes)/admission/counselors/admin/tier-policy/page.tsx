// ============================================================================
// COUNSELOR TIER POLICY (Super-Admin)
// ============================================================================
// Created: 2026-05-06
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This page lets super_admin manage the counselor_tier_policy table that drives
// fn_auto_assign_counselor_v2's tier fallback chain. Edit tier ordering / strategy
// per institution (or globally) without a code deploy. Changes apply on the next
// assignment run after the SQL function rewrite (separate follow-up PR).
// ============================================================================

export const navMeta = { label: 'Tier Policy', icon: 'Layers' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { TierPolicyDataTable } from './_components/tier-policy-data-table';

export default function CounselorTierPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Counselor Tier Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Tier policy drives
            production lead-assignment fallback behavior — locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Counselor Tier Policy">
        <TierPolicyDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
