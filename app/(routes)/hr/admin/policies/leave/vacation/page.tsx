'use client';

// =====================================================================
// /hr/admin/policies/leave/vacation — annual vacation policy
// =====================================================================
// Wave 3 M5a — HR Policy Manual replacement.
// Policy key: hr.leave.vacation
//
// JSON shape splits into Teaching vs Non-Teaching sections inside
// `by_role_type`. The shared institution editor renders the full JSONB
// as a Textarea form — the schema notes below highlight that split.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  summer_winter_as_semester_vacations: true,
  by_role_type: {
    teaching: {
      days_per_year: 14,
      must_be_taken_in_official_vacation_window: true,
      split_across_summer_winter_allowed: true,
      principal_approval_required: true,
      attendance_during_window_mandatory_if_assigned: true,
      encashable: false,
      carry_forward_allowed: false,
      notes: 'Faculty vacation aligned with official semester breaks.',
    },
    non_teaching: {
      days_per_year: 14,
      must_be_taken_in_official_vacation_window: false,
      split_across_summer_winter_allowed: true,
      principal_approval_required: true,
      attendance_during_window_mandatory_if_assigned: true,
      encashable: false,
      carry_forward_allowed: false,
      notes: 'Non-teaching staff vacation; scheduled by HOD.',
    },
  },
};

const SCHEMA_NOTES = [
  '`summer_winter_as_semester_vacations` — true when the institution treats summer + winter breaks as the formal vacation window (typical for engineering).',
  '`by_role_type.teaching` — vacation rules for faculty: days/year + window/split/approval flags.',
  '`by_role_type.non_teaching` — vacation rules for admin/support staff (often distinct from teaching).',
  '`days_per_year` — annual vacation entitlement for the role_type at this institution.',
  '`must_be_taken_in_official_vacation_window` — when true, leave can only be consumed during the official break dates.',
  '`attendance_during_window_mandatory_if_assigned` — when assigned exam/admission duty, attendance overrides the vacation grant.',
  '`encashable`, `carry_forward_allowed` — typically false for vacation (use-it-or-lose-it).',
];

export default function VacationLeavePolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Annual vacation">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Leave' },
            { label: 'Annual vacation' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.leave.vacation"
          policyTitle="Annual vacation"
          policyDescription="Vacation entitlement split into Teaching and Non-Teaching sections; rules per role type."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
