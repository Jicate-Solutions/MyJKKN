'use client';

// =====================================================================
// /hr/admin/policies/excursion-general — institution excursion programme
// =====================================================================
// Wave 3 M6c — HR Policy Manual replacement.
// Policy key: hr.excursion_general (JSONB §32)
//
// Distinct from /hr/admin/policies/rd/excursion (hr.rd.excursion, Wave 3 M3),
// which is the R&D-incentive excursion driven by published-paper count.
// This page edits the *institution-level* excursion programme — permitted
// types and approval flow.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  types: [
    'day',
    'overnight',
    'camp',
    'interstate',
    'international',
    'weekend_vacation',
    'adventure',
    'sea_air',
  ],
  day_excursion_approver: 'Principal_or_nominee',
  approval_form_required: true,
  educational_outcome_assessment_required: true,
  impact_on_school_assessment_required: true,
};

const SCHEMA_NOTES = [
  '`types[]` — permitted excursion categories the institution will fund or sanction. Examples: day, overnight, camp, interstate, international, weekend_vacation, adventure, sea_air.',
  '`day_excursion_approver` — role title that signs off a *day* excursion (typically `Principal_or_nominee`). Other types may need MD sign-off — handled in workflow.',
  '`approval_form_required` — if on, the standard excursion approval form must be filed before booking.',
  '`educational_outcome_assessment_required` — if on, faculty must attach a brief outcome assessment after the trip.',
  '`impact_on_school_assessment_required` — if on, the trip lead must document classroom-disruption / coverage plan before approval.',
  'NOTE — this is the *general* excursion policy. R&D-incentive excursions (top N published-paper authors getting a family trip) live at /hr/admin/policies/rd/excursion under key `hr.rd.excursion`.',
];

export default function ExcursionGeneralPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Excursion programme">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Excursion programme' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.excursion_general"
          policyTitle="Excursion programme (institution-level)"
          policyDescription="Permitted excursion types and approval flow. Separate from the R&D-incentive excursion under /hr/admin/policies/rd/excursion."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
