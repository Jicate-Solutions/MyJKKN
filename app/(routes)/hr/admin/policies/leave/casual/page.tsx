'use client';

// =====================================================================
// /hr/admin/policies/leave/casual — casual leave + outpass + permission
// =====================================================================
// Wave 3 M5a — HR Policy Manual replacement.
// Policy key: hr.leave.casual_outpass_permission
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  casual_leave: {
    quota_by_working_days_per_week: { '6': 12, '5': 6, '4': 0 },
    max_per_request_days: 3,
    advance_notice_days: 3,
    requires_principal_approval_above_days: 2,
    lapses_at_year_end: true,
    carry_forward_allowed: false,
    encashable: false,
    lop_after_quota_exhausted: true,
    eligible_after_probation: false,
    eligible_during_probation: true,
    sandwich_holidays_counted: false,
    half_day_allowed: true,
    prefix_suffix_holiday_allowed: true,
    cannot_combine_with: ['vacation', 'on_duty'],
    min_service_months_to_avail: 0,
    notes: 'CL granted on personal grounds; not encashable; not carried forward.',
  },
  outpass: {
    allowed_per_month: 2,
    max_duration_hours: 4,
    requires_hod_approval: true,
    deducted_from_casual_leave_if_exceeded: true,
    must_return_same_day: true,
    notes: 'Short campus exit during working hours for personal errands.',
  },
  permission_short_time_off: {
    allowed_per_month: 2,
    max_duration_hours: 2,
    requires_hod_approval: true,
    paid: true,
    late_arrival_counted: true,
    early_leaving_counted: true,
    notes: 'Paid short permission slots (late arrival / early leaving / personal slot).',
  },
};

const SCHEMA_NOTES = [
  '`casual_leave.quota_by_working_days_per_week` — quota varies with the institution working week. Key = working-days-per-week (string), value = annual CL days.',
  '`casual_leave.max_per_request_days` — single application cannot exceed this many CL days.',
  '`casual_leave.advance_notice_days` — minimum advance notice required before CL start.',
  '`casual_leave.lop_after_quota_exhausted` — extra days beyond quota become Loss of Pay.',
  '`casual_leave.cannot_combine_with` — leave types that cannot be combined with CL (e.g., vacation, on_duty).',
  '`outpass` — short campus exits during working hours; counted, with monthly cap.',
  '`permission_short_time_off` — paid late-arrival / early-leaving slots (typically 2/month × 2hr).',
];

export default function CasualLeavePolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Casual leave + outpass + permission">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Leave' },
            { label: 'Casual + outpass + permission' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.leave.casual_outpass_permission"
          policyTitle="Casual leave, outpass and permission"
          policyDescription="Casual leave quota, outpass and short-time-off permission rules per institution."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
