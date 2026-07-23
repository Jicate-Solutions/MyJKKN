'use client';

// =====================================================================
// /hr/admin/policies/rd/research-leave — Director-tunable research leave
// =====================================================================
// Wave 3 M3: surface hr.rd.research_leave (JSONB §7) for Director edits.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { RdPolicyEditor, type FieldSpec } from '../_components/RdPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'max_days_per_year',
    label: 'Max research-leave days per year',
    help: 'Upper cap on research-leave days a faculty member can take in a calendar year.',
    type: 'number',
  },
  {
    key: 'combinable_with_special_cl_only',
    label: 'Combinable with Special CL only',
    help: 'If on, research leave can only be combined with Special CL — not regular CL.',
    type: 'boolean',
  },
  {
    key: 'combinable_with_holidays',
    label: 'Combinable with holidays',
    help: 'If on, faculty can stack research leave next to holidays.',
    type: 'boolean',
  },
  {
    key: 'holidays_count_as_research_cl',
    label: 'Holidays count as research CL',
    help: 'If on, intervening holidays consume research-CL balance. Usually off.',
    type: 'boolean',
  },
  {
    key: 'exception_approver_chain',
    label: 'Exception approver chain',
    help: 'Comma-separated, in order. Who can approve an over-the-cap exception.',
    type: 'string-array',
  },
  {
    key: 'label_per_institution',
    label: 'Label per institution (legacy)',
    help: 'Internal display labels by historical institution name. Read-only reference. Edit the underlying JSON only.',
    type: 'string',
  },
];

export default function ResearchLeavePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="R&D — Research Leave">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'R&D — Research Leave' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          How many days of research leave faculty get each year, what it can combine with,
          and who approves exceptions. Each institution edits its own row.
        </div>
        <RdPolicyEditor policyKey="hr.rd.research_leave" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
