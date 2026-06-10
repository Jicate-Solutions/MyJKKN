'use client';

// =====================================================================
// /hr/admin/policies/institution-meta — institutional metadata editor
// =====================================================================
// Wave 3 M1 — HR Policy Manual replacement.
// Policy key: hr.institution_meta (string literal during W3-M0
// consolidation window; cleanup PR flips to POLICY_KEYS constant after
// M0 lands).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  name: '',
  vision_text: '',
  mission_text: '',
  contact: { email: '', mobile: '' },
  address: '',
  doc_refs: {},
  manual_meta: { approved_by: '', approved_on: '', review_cycle_years: 2 },
};

const SCHEMA_NOTES = [
  '`name` — full official name of the institution.',
  '`vision_text` / `mission_text` — long-form statements printed on the inside cover of the staff manual.',
  '`contact.email` and `contact.mobile` — primary contact reachable for staff queries.',
  '`address` — single-line postal address.',
  '`doc_refs` — free-form object of external document keys (staff manual version, ISO cert, regulatory body recognition).',
  '`manual_meta` — who approved this manual chapter, when, and how often it is reviewed.',
];

export default function InstitutionMetaPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Institution metadata">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Institution metadata' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.institution_meta"
          policyTitle="Institution metadata"
          policyDescription="Name, vision, mission, contact details and manual approval record for the institution."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
