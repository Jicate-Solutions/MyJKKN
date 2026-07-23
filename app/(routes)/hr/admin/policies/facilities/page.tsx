'use client';

// =====================================================================
// /hr/admin/policies/facilities — campus facilities editor
// =====================================================================
// Wave 3 M1 — HR Policy Manual replacement.
// Policy key: hr.facilities
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  library: { exists: false, volumes: 0, hours: '' },
  digital_library: { exists: false, seats: 0, subscriptions: [] },
  transport: { available: false, routes: 0, staff_eligible: false },
  medical: { on_campus_clinic: false, doctor_visiting_days: [] },
  canteen: { exists: false, subsidised: false, hours: '' },
  mess: { exists: false, veg_only: false, monthly_charge_inr: null },
};

const SCHEMA_NOTES = [
  '`library` — physical library (volumes count, daily hours).',
  '`digital_library` — e-resources, seats, journal subscriptions list.',
  '`transport` — campus shuttle/bus availability, route count, staff eligibility.',
  '`medical` — on-campus clinic flag and weekly visiting-doctor days.',
  '`canteen` / `mess` — food facilities, subsidy and pricing.',
];

export default function FacilitiesPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Facilities">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Facilities' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.facilities"
          policyTitle="Campus facilities"
          policyDescription="Library, digital library, transport, medical, canteen and mess facilities available to staff."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
