// ============================================================================
// HR RECRUITMENT APPROVALS — SCOPE POLICY (Super-Admin)
// ============================================================================
// Director's STANDING RULE (memory: feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super-admin UI to write + reader fn.
//
// This page lets super_admin edit the two platform_policies rows that drive
// the HR recruitment-approvals scoping engine:
//
//   1. hr.recruitment.approvals.enforce_scoping (boolean) — master switch
//   2. hr.recruitment.approvals.scope_rules     (JSONB)   — per-role scope map
//
// Director's view (English consequences, visual cascade) — NEVER render raw
// JSONB. Roles get checkboxes / selects, every change shows the English
// consequence inline.
//
// Phase: UI-only. Engine reader (`getPolicy()` / scope SQL) is shipped by
// Agent A in a parallel PR. Page renders empty/default state until A's seeds
// land — that is by design.
// ============================================================================

export const navMeta = {
  label: 'Recruitment Approvals Scope',
  icon: 'ShieldCheck',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { ScopePolicyEditor } from './_components/scope-policy-editor';

export default function HrRecruitmentApprovalsScopePage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Recruitment Approvals — Scope Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Recruitment
            approvals scoping decides which candidates each approver can see —
            it is locked tight to prevent accidental data exposure.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Recruitment Approvals — Decide which candidates each approver can see">
        <ScopePolicyEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
