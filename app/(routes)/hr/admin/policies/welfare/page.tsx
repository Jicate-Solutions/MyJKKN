'use client';

// =====================================================================
// /hr/admin/policies/welfare — staff welfare activities editor
// =====================================================================
// Wave 3 M1 — HR Policy Manual replacement.
// Policy key: hr.welfare_activities
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  celebrations: [],
  annual_health_checkup: true,
  other_activities: [],
};

const SCHEMA_NOTES = [
  '`celebrations[]` — annual / cultural / national-day events expected to involve staff. Each row: { name, month (1–12), mandatory }.',
  '`annual_health_checkup` — whether the institution funds an annual health-checkup camp for staff.',
  '`other_activities[]` — picnics, yoga days, oral-health camps, monthly birthday celebrations, etc. Each row: { name, frequency }.',
];

export default function WelfareActivitiesPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Welfare activities">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Welfare activities' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.welfare_activities"
          policyTitle="Staff welfare activities"
          policyDescription="Celebrations, health checkup and other welfare activities surfaced to staff."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
