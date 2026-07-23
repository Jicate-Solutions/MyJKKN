'use client';

// =====================================================================
// /hr/admin/policies/reimbursement-workflow — paper publication reimbursement
// =====================================================================
// Wave 3 M6c — HR Policy Manual replacement.
// Policy key: hr.reimbursement_workflow (JSONB §35)
//
// This is the *workflow* policy for paper-publication reimbursement claims:
// who applies, what window, which approver to pick, and whether a Director
// 1:1 is mandatory before payout. Separate from the R&D *incentive matrix*
// (papers required, impact-factor thresholds) which lives under
// hr.rd.publication_incentives (Wave 3 M3).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  paper_authors_apply_via_hr_app: true,
  application_window_months: 1,
  select_principal_not_reporting_manager: true,
  director_one_on_one_required: true,
  claim_form_template_ref: 'https://drive.jkkn.ac.in/hr/forms/publication-reimbursement-claim',
  r_and_d_policy_doc_ref: 'https://drive.jkkn.ac.in/hr/policy/rd-reimbursement',
};

const SCHEMA_NOTES = [
  '`paper_authors_apply_via_hr_app` — if on, authors must file the claim inside the HR app (not via email).',
  '`application_window_months` — number of months after publication within which the claim must be filed (typically 1).',
  '`select_principal_not_reporting_manager` — at submission time the approver is the institution Principal, not the staff member’s reporting manager.',
  '`director_one_on_one_required` — Director conducts a 1:1 with the author before payout is approved.',
  '`claim_form_template_ref` — URL or doc path of the claim form template.',
  '`r_and_d_policy_doc_ref` — URL or doc path of the parent R&D reimbursement policy.',
  'NOTE — eligibility thresholds (papers required, impact factor) live separately under `hr.rd.publication_incentives` at /hr/admin/policies/rd/publication-incentives. This policy is about *how* to claim, not *whether* you qualify.',
];

export default function ReimbursementWorkflowPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Reimbursement workflow">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Reimbursement workflow' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.reimbursement_workflow"
          policyTitle="Paper-publication reimbursement workflow"
          policyDescription="How faculty file publication-reimbursement claims and who approves them. Eligibility thresholds live separately under hr.rd.publication_incentives."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
