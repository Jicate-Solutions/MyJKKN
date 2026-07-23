'use client';

// =====================================================================
// /hr/admin/policies/resignation-workflow — resignation RULE substrate
// =====================================================================
// Wave 3 M6c — HR Policy Manual replacement.
// Policy key: hr.resignation_workflow (JSONB §34)
//
// IMPORTANT — RULE vs CASE substrates:
//   This page edits the *rules* a resignation must satisfy (min service,
//   notice period, dues settlement, academic-year alignment).
//   The actual *case instances* (one row per staff exit, with step-completion
//   audit) live in `hr_offboarding_cases` + `hr_offboarding_step_completions`
//   from Wave 1 γ migration 20260515000004_hr_offboarding_substrate.sql.
//   Both substrates coexist — this RULE policy is read at submission time
//   by the offboarding workflow.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { InstitutionPolicyEditor } from '../_components/institution-policy-editor';

const DEFAULT_VALUE = {
  per_appointment_letter_provisions: true,
  dues_settlement_requires_clearance_form: true,
  min_service_years: 2,
  notice_period_months: 2,
  notice_or_pay_in_lieu: true,
  notice_starts_after_md_approval: true,
  end_of_academic_year_only: true,
  offboarding_workflow_doc_ref: 'https://drive.jkkn.ac.in/hr/policy/offboarding-workflow',
};

const SCHEMA_NOTES = [
  '`per_appointment_letter_provisions` — clauses from the staff member’s appointment letter override these defaults.',
  '`dues_settlement_requires_clearance_form` — full and final settlement only after the staff clearance form is signed off.',
  '`min_service_years` — minimum number of years the staff must have served before resignation is accepted (typically 2).',
  '`notice_period_months` — required notice period in months (typically 2).',
  '`notice_or_pay_in_lieu` — staff may shorten notice by paying salary in lieu of the notice period.',
  '`notice_starts_after_md_approval` — the notice-period clock only starts after the MD formally accepts the resignation.',
  '`end_of_academic_year_only` — resignations effective dates are pinned to the end of the academic year (faculty continuity rule).',
  '`offboarding_workflow_doc_ref` — link to the documented offboarding workflow (PDF or shared drive).',
  'NOTE — actual resignation cases (one row per staff exit, with per-step completion audit) live in `hr_offboarding_cases` (Wave 1 γ #890). This policy stores the RULES; that table stores the CASES.',
];

export default function ResignationWorkflowPolicyPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Resignation rules">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Resignation rules' },
          ]}
        />
        <InstitutionPolicyEditor
          policyKey="hr.resignation_workflow"
          policyTitle="Resignation rules"
          policyDescription="Rules governing when and how staff may resign. Actual resignation case execution is recorded in hr_offboarding_cases."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
