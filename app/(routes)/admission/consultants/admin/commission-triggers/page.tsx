// ============================================================================
// CONSULTANT COMMISSION TRIGGERS (Super-Admin)
// ============================================================================
// Created: 2026-05-13
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This page lets super_admin manage the consultant_commission_trigger_config
// table that defines WHEN a consultant_commission_transactions row gets
// created (which lead/admission/learner stage transition fires it), at what
// TDS rate, with what auto-approve threshold and clawback grace window.
//
// Day-1 behavior is preserved: every auto-trigger row is seeded with
// creates_commission=false; only the `manual` row is active and supplies
// defaults to ConsultantService.createCommissionTransaction. Director toggles
// auto-trigger rows ON from this UI later — zero deploys.
// ============================================================================

export const navMeta = { label: 'Commission Triggers', icon: 'Coins' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { TriggerConfigDataTable } from './_components/trigger-config-data-table';

export default function ConsultantCommissionTriggersPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Consultant Commission Triggers">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Commission trigger
            policy decides when consultant commissions are created — locked
            tight.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Consultant Commission Triggers">
        <TriggerConfigDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
