'use client';

// =====================================================================
// /hr/admin/policies/rd/wfh-rules — Director-tunable WFH rules
// =====================================================================
// Wave 3 M3: surface hr.rd.wfh_rules (JSONB §6) for Director edits.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { RdPolicyEditor, type FieldSpec } from '../_components/RdPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'max_per_week',
    label: 'Max WFH days per week',
    help: 'Maximum number of work-from-home days a qualifying faculty member can take in a week.',
    type: 'number',
  },
  {
    key: 'required_indexing',
    label: 'Required indexing',
    help: 'Comma-separated indexing databases the publication must appear in. Example: SCOPUS, WOS.',
    type: 'string-array',
  },
  {
    key: 'approval_chain',
    label: 'Approval chain',
    help: 'Comma-separated, in order. Example: Principal, Director.',
    type: 'string-array',
  },
  {
    key: 'publication_proof_required_fields',
    label: 'Publication proof fields required',
    help: 'Comma-separated fields the faculty must include in their proof submission. Example: vol_no, issue_no, PP.',
    type: 'string-array',
  },
  {
    key: 'requires_published_indexed_pub',
    label: 'Requires published indexed publication',
    help: 'If on, only faculty with at least one published & indexed paper can request WFH.',
    type: 'boolean',
  },
];

export default function WfhRulesPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="R&D — Work-From-Home Rules">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'R&D — WFH Rules' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          When a faculty member can work from home, what publications they need, and who
          approves the request. Each institution edits its own row. Changes go through
          a Draft &rarr; Publish flow with a mandatory audit reason.
        </div>
        <RdPolicyEditor policyKey="hr.rd.wfh_rules" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
