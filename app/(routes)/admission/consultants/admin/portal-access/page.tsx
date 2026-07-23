// ============================================================================
// CONSULTANT PORTAL ACCESS POLICY (Super-Admin)
// ============================================================================
// Created: 2026-05-13
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn
// that materializes the policy. Zero deploys, zero PRs, zero developer
// round-trips for future tweaks.
//
// What this page edits
// --------------------
// The `consultant_portal_access_policy` table — a principal-typed allowlist
// that drives THREE separate concerns via a `rule_type` discriminator:
//   1. portal_login_allowed   — who can load /consultant-portal at all
//   2. rls_read_own_data      — who gets the additive RLS self-read on
//                                consultant_lead_attributions /
//                                consultant_commission_transactions
//   3. preview_as_consultant  — which roles may use see-as-user to enter
//
// Anti-pattern this retires
// -------------------------
// Hardcoded role-string arrays in middleware / RLS / preview-as gates.
// See memory/feedback_strict_counselor_override_list_traps_senior_leadership.md.
// Adding a new persona is now a one-row INSERT, not a redeploy.
//
// UX decision
// -----------
// SINGLE DataTable with a rule_type filter (and a section-grouped layout in
// the table itself), instead of three tabs. Rationale: Director typically
// edits 2-3 rows at a time across all three rule_types when onboarding a new
// persona (e.g., adding "CEO" needs entries in portal_login_allowed AND
// preview_as_consultant). One scrollable table beats three tab-switches.
//
// Companion service:   lib/services/admission/consultant-portal-access-service.ts
// Companion migration: supabase/migrations/20260513150002_create_consultant_portal_access_policy.sql
// ============================================================================

export const navMeta = { label: 'Portal Access Policy', icon: 'KeyRound' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { PortalAccessDataTable } from './_components/portal-access-data-table';

export default function ConsultantPortalAccessPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Consultant Portal Access Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The portal access
            policy gates who can sign in to /consultant-portal/*, who can read
            their own attribution and commission data, and who can preview-as
            a specific consultant — locked tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Consultant Portal Access Policy">
        <PortalAccessDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
