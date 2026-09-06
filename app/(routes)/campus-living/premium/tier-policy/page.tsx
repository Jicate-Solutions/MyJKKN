// ============================================================================
// PREMIUM ROOM — TIER POLICY (Super-Admin / Chief-Warden)
// ============================================================================
// Created: 2026-05-16
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
//
// This page lets super_admin / admin (and chief_warden via the
// campus_living.premium.configure_tier permission) manage the
// hostel_tier_policy table — the 3-tier ladder (standard / premium /
// premium_plus) for the paid Premium Room SKU. Edit fee uplift %, feature
// bundle, and activation state globally or per-institution without a code
// deploy.
//
// Companion service:   lib/services/campus-living/hostel-tier-service.ts
// Companion migration: supabase/migrations/20260516131800_create_hostel_tier_policy.sql
// ============================================================================

export const navMeta = { label: 'Campus Living — Tier Policy', icon: 'BedDouble' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { TierPolicyDataTable } from './_components/tier-policy-data-table';

export default function CampusLivingTierPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Campus Living — Tier Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Tier policy drives
            the Premium Room SKU — fees, feature bundles, room access. Chief
            wardens with the right permission can edit per-college overrides
            from the Campus Living admin panel.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Campus Living — Tier Policy">
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-5">
          <h3 className="mb-2 text-sm font-semibold">What does this control?</h3>
          <p className="text-sm text-muted-foreground">
            The Premium Room SKU has 3 tiers:{' '}
            <strong>standard</strong> (default, no extra fee) →{' '}
            <strong>premium</strong> (self-pick block / room / bed / roommate) →{' '}
            <strong>premium plus</strong> (premium + extended curfew + premium
            maintenance SLA).
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The rows below are the platform defaults. To customize a tier for
            one college only — say, lift the premium uplift from 25% to 30% at
            JKKN College of Engineering — add an override row scoped to that
            institution. The override wins over the global default when the
            allocation belongs to that institution.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tier features (e.g. <code>pick_roommate_with_consent</code>) are
            machine keys the service layer reads at runtime to gate the
            corresponding UI affordance. Adding a new feature key requires a
            code change; reordering / removing existing keys from a tier is
            safe to do here.
          </p>
        </div>
        <TierPolicyDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
