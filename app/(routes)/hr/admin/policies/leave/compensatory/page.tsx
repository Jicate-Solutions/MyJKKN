'use client';

// =====================================================================
// /hr/admin/policies/leave/compensatory — comp-off rules
// =====================================================================
// Wave 3 M5a — HR Policy Manual replacement.
// Policy key: hr.leave.compensatory
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  ratio_per_holiday_worked: 1,
  expiry_months: 3,
  fractional_allowed: false,
  requires_pre_approval: true,
  requires_principal_approval: true,
  eligible_for_teaching: true,
  eligible_for_non_teaching: true,
  min_hours_worked_to_qualify: 6,
  cannot_combine_with: ['casual_leave'],
  lapses_after_expiry: true,
  encashable: false,
  notes: 'Comp-off granted 1:1 for full working day on a designated holiday; expires in 3 months.',
};

const SCHEMA_NOTES = [
  '`ratio_per_holiday_worked` — typically 1 (one comp-off day per holiday worked).',
  '`expiry_months` — comp-off lapses if not consumed within this many months from grant.',
  '`fractional_allowed` — whether partial-day comp-off is permitted.',
  '`min_hours_worked_to_qualify` — minimum hours on the holiday for the day to qualify.',
  '`cannot_combine_with` — leave types that cannot be combined with comp-off.',
  '`lapses_after_expiry` — when true, unused comp-off is forfeited at expiry (default).',
];

export default function CompensatoryLeavePolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Compensatory off">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Leave' },
            { label: 'Compensatory off' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.leave.compensatory"
          policyTitle="Compensatory off"
          policyDescription="Comp-off ratio, expiry window and grant rules when staff work designated holidays."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
