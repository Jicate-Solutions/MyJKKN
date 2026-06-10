'use client';

// =====================================================================
// /hr/admin/policies/cadres — faculty + supporting cadres editor
// =====================================================================
// Wave 3 M1 — HR Policy Manual replacement.
// Policy key: hr.cadres
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  teaching_cadres: [],
  supporting_technical_cadres: [],
  non_technical_cadres: [],
};

const SCHEMA_NOTES = [
  '`teaching_cadres[]` — Professor / Associate Professor / Assistant Professor (or dental-specific Reader / Senior Lecturer / Lecturer). Each row: { name, min_qualification, years_experience }.',
  '`supporting_technical_cadres[]` — lab tech, system admin, workshop instructor (engineering) or dental hygienist / lab tech / radiographer (dental).',
  '`non_technical_cadres[]` — office assistant, accountant, driver, receptionist, housekeeping.',
  'Each cadre row drives recruitment posting templates and offer-letter generation downstream.',
];

export default function CadresPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Cadres">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Cadres' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.cadres"
          policyTitle="Cadres"
          policyDescription="Faculty, supporting technical and non-technical cadre definitions with entry criteria."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
