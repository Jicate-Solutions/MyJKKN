'use client';

// =====================================================================
// /hr/admin/policies/rd/publication-incentives — Director-tunable R&D
// =====================================================================
// Wave 3 M3: surface hr.rd.publication_incentives (JSONB §5) for Director
// edits without a deploy. Writes land in platform_policies; consumer code
// reads them via fn_get_policy_json.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { RdPolicyEditor, type FieldSpec } from '../_components/RdPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'min_impact_factor_for_conf_sponsorship',
    label: 'Min impact factor — conference sponsorship',
    help: 'Lowest journal impact factor that qualifies a paper to count toward conference sponsorship.',
    type: 'number',
  },
  {
    key: 'papers_required_for_conf_sponsorship',
    label: 'Papers required for conference sponsorship',
    help: 'How many qualifying papers a faculty member needs before they can be sponsored to a conference.',
    type: 'number',
  },
  {
    key: 'papers_required_for_md_additional_facilities',
    label: 'Papers for MD-approved additional facilities',
    help: 'Threshold at which a faculty member becomes eligible for additional facilities approved by the MD.',
    type: 'number',
  },
  {
    key: 'min_impact_factor_for_national_seminar',
    label: 'Min impact factor — national seminar',
    help: 'Lowest impact factor that counts a paper toward national-seminar TA/DA eligibility.',
    type: 'number',
  },
  {
    key: 'papers_required_for_national_seminar_TADA',
    label: 'Papers required for national seminar TA/DA',
    help: 'How many qualifying papers a faculty member needs for TA/DA at a national seminar.',
    type: 'number',
  },
  {
    key: 'papers_plus_patent_eligibility',
    label: 'Papers + patent eligibility',
    help: 'Combo threshold. Format: papers=N,patents=N. Example: papers=3,patents=1.',
    type: 'object-papers-patents',
  },
  {
    key: 'reimbursement_claim_window_months',
    label: 'Reimbursement claim window (months)',
    help: 'How many months a faculty member has to submit reimbursement after the event.',
    type: 'number',
  },
  {
    key: 'reimbursement_approver_chain',
    label: 'Reimbursement approver chain',
    help: 'Comma-separated, in order. Example: Principal, Director.',
    type: 'string-array',
  },
  {
    key: 'claim_form_doc_ref',
    label: 'Claim form doc reference',
    help: 'URL or doc path of the claim form template.',
    type: 'string',
  },
  {
    key: 'reimbursement_policy_doc_ref',
    label: 'Reimbursement policy doc reference',
    help: 'URL or doc path of the full reimbursement policy document.',
    type: 'string',
  },
];

export default function PublicationIncentivesPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="R&D — Publication Incentives">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'R&D — Publication Incentives' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          Publication incentive matrix: how many papers, what minimum impact factor, and
          who approves reimbursements. Each institution edits its own row. Changes go
          through a Draft &rarr; Publish flow with a mandatory audit reason.
        </div>
        <RdPolicyEditor policyKey="hr.rd.publication_incentives" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
