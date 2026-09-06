'use client';

// =====================================================================
// /hr/admin/policies/rd/excursion — Director-tunable excursion eligibility
// =====================================================================
// Wave 3 M3: surface hr.rd.excursion (JSONB §8). Two per-institution
// variants: Engineering uses papers_published model; Dental uses
// facilitator_grade model. Editor swaps the field set based on the row's
// eligibility_model value.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { RdPolicyEditor, type FieldSpec } from '../_components/RdPolicyEditor';

// Shared base fields rendered for either eligibility_model variant.
const BASE_FIELDS: FieldSpec[] = [
  {
    key: 'eligibility_model',
    label: 'Eligibility model',
    help: 'How faculty qualify. papers_published = N papers required. facilitator_grade = min grade required.',
    type: 'enum',
    enumOptions: ['papers_published', 'facilitator_grade'],
  },
  {
    key: 'must_be_during_holidays',
    label: 'Must be during holidays',
    help: 'If on, excursions can only be scheduled during institutional holidays.',
    type: 'boolean',
  },
  {
    key: 'management_contribution_rule',
    label: 'Management contribution rule',
    help: 'How the management contribution is decided. Usually case_by_case.',
    type: 'enum',
    enumOptions: ['case_by_case', 'fixed_percentage', 'none'],
  },
  {
    key: 'documentation_required',
    label: 'Documentation required',
    help: 'If on, faculty must attach photos / brief on Staff Drive after the trip.',
    type: 'boolean',
  },
  {
    key: 'documentation_storage_ref',
    label: 'Documentation storage reference',
    help: 'Where to store after-trip documentation. Example: Staff Drive Excursions folder.',
    type: 'string',
  },
  {
    key: 'application_form_ref',
    label: 'Application form reference',
    help: 'URL or doc path of the excursion application form.',
    type: 'string',
  },
  {
    key: 'min_papers_published',
    label: 'Min papers published (papers_published model)',
    help: 'Used when eligibility_model = papers_published. Leave 0 if facilitator_grade.',
    type: 'number',
  },
  {
    key: 'top_n_eligible_with_family',
    label: 'Top N go with family (papers_published model)',
    help: 'Of those who qualify by paper count, top N get to take family along.',
    type: 'number',
  },
  {
    key: 'facilitator_grade_min',
    label: 'Min facilitator grade (facilitator_grade model)',
    help: 'Used when eligibility_model = facilitator_grade. Example: B.',
    type: 'string',
  },
  {
    key: 'facilitator_grading_doc_ref',
    label: 'Facilitator grading doc reference',
    help: 'URL or doc path of the grading rubric. Used by Dental.',
    type: 'string',
  },
];

export default function ExcursionPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="R&D — Excursion Eligibility">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'R&D — Excursion' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          Who qualifies for an institution-funded excursion. Engineering and Dental use
          different eligibility models — switch the model on the row to swap which
          fields drive the decision. Each institution edits its own row.
        </div>
        <RdPolicyEditor policyKey="hr.rd.excursion" fields={BASE_FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
