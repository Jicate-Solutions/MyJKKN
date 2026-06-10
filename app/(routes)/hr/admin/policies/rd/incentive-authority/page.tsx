'use client';

// =====================================================================
// /hr/admin/policies/rd/incentive-authority — who approves R&D incentives
// =====================================================================
// Wave 3 M3: surface hr.rd.incentive_authority (JSONB §9) for Director edits.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { RdPolicyEditor, type FieldSpec } from '../_components/RdPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'journal_pub_assistance_basis',
    label: 'Journal publication assistance — basis',
    help: 'How journal-publication assistance amounts are decided. Usually depends_on_journal_nature.',
    type: 'enum',
    enumOptions: ['depends_on_journal_nature', 'flat_amount', 'tiered_by_impact_factor'],
  },
  {
    key: 'sponsored_research_overhead_approver',
    label: 'Sponsored research — overhead approver',
    help: 'Who signs off on sponsored-research overheads. Usually MD.',
    type: 'enum',
    enumOptions: ['MD', 'Director', 'Principal', 'CAO'],
  },
  {
    key: 'sponsored_research_pi_authority',
    label: 'Sponsored research — PI appointing authority',
    help: 'Who appoints the Principal Investigator on sponsored research.',
    type: 'enum',
    enumOptions: ['MD', 'Director', 'Principal'],
  },
  {
    key: 'sponsored_research_approval_basis',
    label: 'Sponsored research — approval basis',
    help: 'How sponsored-research proposals are approved. Usually case_by_case_by_management.',
    type: 'enum',
    enumOptions: [
      'case_by_case_by_management',
      'standing_committee',
      'auto_approve_under_threshold',
    ],
  },
];

export default function IncentiveAuthorityPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="R&D — Incentive Authority">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'R&D — Incentive Authority' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          Who approves R&D incentive payouts and on what basis. Edit per institution.
          Changes are audited.
        </div>
        <RdPolicyEditor policyKey="hr.rd.incentive_authority" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
