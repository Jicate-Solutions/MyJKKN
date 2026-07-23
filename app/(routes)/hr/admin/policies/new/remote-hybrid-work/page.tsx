'use client';

// =====================================================================
// /hr/admin/policies/new/remote-hybrid-work
// =====================================================================
// Wave 3 M8: surface hr.new.remote_hybrid_work (institution-scoped JSONB)
// for Director and CAO edits. Seeded as draft_only starter content with
// Indian higher-ed hybrid work norms 2024-2026 as the basis.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { NewPolicyEditor, type FieldSpec } from '../_components/NewPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'eligibility_by_role',
    label: 'Eligibility by role',
    help: 'How many remote days per week each role group can take, plus any approval chain for the role.',
    type: 'json-subtree',
    children: [
      {
        key: 'teaching_faculty',
        label: 'Teaching faculty',
        help: 'In-person teaching is typically required. Set max remote days carefully.',
        type: 'json-subtree',
        children: [
          { key: 'max_remote_days_per_week', label: 'Max remote days per week', type: 'number' },
          { key: 'reason', label: 'Reason / note', type: 'string' },
        ],
      },
      {
        key: 'research_faculty',
        label: 'Research faculty',
        help: 'Research faculty often need remote days for lab/library/writing time.',
        type: 'json-subtree',
        children: [
          { key: 'max_remote_days_per_week', label: 'Max remote days per week', type: 'number' },
          {
            key: 'approval_chain',
            label: 'Approval chain (in order)',
            help: 'Who approves the remote arrangement, in order.',
            type: 'string-list-managed',
          },
        ],
      },
      {
        key: 'administrative',
        label: 'Administrative staff',
        type: 'json-subtree',
        children: [
          { key: 'max_remote_days_per_week', label: 'Max remote days per week', type: 'number' },
        ],
      },
      {
        key: 'it_support',
        label: 'IT support',
        type: 'json-subtree',
        children: [
          { key: 'max_remote_days_per_week', label: 'Max remote days per week', type: 'number' },
        ],
      },
    ],
  },
  {
    key: 'remote_day_requirements',
    label: 'Remote day requirements',
    help: 'What the staff member must do on each remote day to be considered working.',
    type: 'json-subtree',
    children: [
      {
        key: 'minimum_working_hours_per_remote_day',
        label: 'Minimum working hours per remote day',
        type: 'number',
      },
      {
        key: 'availability_window_per_remote_day',
        label: 'Availability window (HH:MM-HH:MM)',
        help: 'Local time. Example: 10:00-17:00.',
        type: 'string',
      },
      {
        key: 'must_be_reachable_via',
        label: 'Must be reachable via',
        help: 'Communication channels on which staff must be reachable during the availability window.',
        type: 'string-list-managed',
      },
      {
        key: 'deliverables_documented',
        label: 'Deliverables documented',
        help: 'If on, staff must record what they completed on each remote day.',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'exception_approval_chain',
    label: 'Exception approval chain',
    help: 'When a staff member requests remote days beyond their role default, who approves the exception (in order).',
    type: 'string-list-managed',
  },
  {
    key: 'trial_period_days_for_new_remote_arrangement',
    label: 'Trial period (days) for new remote arrangement',
    help: 'When a fresh remote arrangement is set up, run it as a trial for this many days before making it permanent.',
    type: 'number',
  },
];

export default function RemoteHybridWorkPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Remote & Hybrid Work">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'New — Remote & Hybrid Work' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          When a staff member can work from home, how many days per week, what they
          need to do on remote days, and who approves exceptions. Each institution
          edits its own row. Starter draft seeded from Indian higher-ed hybrid work
          norms 2024-2026; Director and CAO should review and customize before
          publishing.
        </div>
        <NewPolicyEditor policyKey="hr.new.remote_hybrid_work" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
