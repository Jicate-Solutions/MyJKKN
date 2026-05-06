// ============================================================================
// ASSIGNMENT RULE TYPE REGISTRY (Super-Admin)
// ============================================================================
// Created: 2026-05-07
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write.
//
// This page lets super_admin manage the assignment_rule_type_registry table that
// drives the rule-form-dialog dropdown shown to counselors when they create
// assignment rules. Add a new rule type / hide a stale one — no code deploy.
// ============================================================================

export const navMeta = { label: 'Rule Types', icon: 'ListChecks' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { RuleTypesDataTable } from './_components/rule-types-data-table';

export default function CounselorRuleTypesPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Assignment Rule Types">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Rule-type registry
            drives the assignment-rule strategy picker shown to counselors —
            edits change behavior across every institution.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Assignment Rule Types">
        <RuleTypesDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
