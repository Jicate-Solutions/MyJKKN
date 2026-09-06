// ============================================================================
// CONSULTANT TIER POLICY (Super-Admin)
// ============================================================================
// Created: 2026-05-13
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
// Zero deploys, zero PRs, zero developer round-trips for future tweaks.
//
// This page lets super_admin manage the consultant_tier_policy table — the
// bronze→silver→gold→platinum→diamond ladder for education consultants. Edit
// thresholds globally or override per institution without a code deploy.
// Changes apply on the next read after a 60-second in-memory cache miss.
//
// Companion service:   lib/services/admission/consultant-tier-policy-service.ts
// Companion migration: supabase/migrations/20260513150001_create_consultant_tier_policy.sql
// ============================================================================

export const navMeta = { label: 'Consultant Tier Policy', icon: 'Award' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { TierPolicyDataTable } from './_components/tier-policy-data-table';

export default function ConsultantTierPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Consultant Tier Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Tier policy drives
            consultant tier badges, payouts, and dashboard ranking — locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Consultant Tier Policy">
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold">What does this control?</h3>
          <p className="text-sm text-muted-foreground">
            Education consultants earn tier badges as they convert leads. The
            ladder is <strong>bronze → silver → gold → platinum → diamond</strong>.
            Each tier has a conversion threshold — e.g. you reach{' '}
            <strong>silver</strong> after 10 conversions, <strong>gold</strong>{' '}
            after 25, and so on.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The rows below are the platform defaults. You can also add an
            override for a specific college — that replaces the default
            thresholds for consultants attached to that college only.
          </p>
        </div>
        <TierPolicyDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
