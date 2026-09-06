'use client';

// =====================================================================
// /hr/admin/policies/working-schedule — institutional working schedule
// =====================================================================
// Wave 3 M1 — HR Policy Manual replacement.
// Policy key: hr.working_schedule
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  working_days_per_week: 6,
  by_role_type: {
    teaching: {
      start_time: '09:00',
      end_time: '17:00',
      lunch_break_minutes: 45,
      office_hours_required: true,
    },
    non_teaching: {
      start_time: '09:00',
      end_time: '17:00',
      lunch_break_minutes: 30,
    },
  },
  extra_time_loyalty_expected: true,
  second_saturday_holiday: true,
};

const SCHEMA_NOTES = [
  '`working_days_per_week` — typically 6 across JKKN institutions.',
  '`by_role_type.teaching` — faculty start/end + lunch break + class-load or clinical hours expectation.',
  '`by_role_type.non_teaching` — admin/support staff working hours.',
  '`extra_time_loyalty_expected` — whether the institution expects unpaid extra hours during peak terms.',
  '`second_saturday_holiday` — whether the 2nd Saturday of each month is a paid holiday.',
];

export default function WorkingSchedulePolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Working schedule">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Working schedule' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.working_schedule"
          policyTitle="Working schedule"
          policyDescription="Daily working hours, lunch break, working days per week and extra-time expectation by role type."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
