// ============================================================================
// LEAD STAGES POLICY (Super-Admin)
// ============================================================================
// Created: 2026-05-07
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This page lets super_admin manage the lead_active_stage_policy table that drives
// which funnel stages count toward counselor workload caps. Marking a stage as
// "terminal" (e.g. Lost, Enrolled) means counselors free up capacity when a lead
// reaches that stage.
//
// Phase 1B: UI + service layer. Depends on:
//   - Phase 1A: table migration (lead_active_stage_policy)
//   - Phase 1C: API routes (/api/admin/lead-stages-policy)
// ============================================================================

export const navMeta = { label: 'Lead Stages Policy', icon: 'GitBranch' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { LeadStagesDataTable } from './_components/lead-stages-data-table';

export default function LeadStagesPolicyPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Lead Stages Policy">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Lead stage policy
            drives counselor workload caps — it is locked tight to prevent
            accidental changes.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Lead Stages Policy — Decide which funnel stages count toward counselor workload">
        <LeadStagesDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
