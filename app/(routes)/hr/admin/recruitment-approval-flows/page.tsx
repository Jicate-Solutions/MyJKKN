// ============================================================================
// HR RECRUITMENT — APPROVAL WORKFLOWS MANAGER
// ============================================================================
// List-first (2026-07-09): a table of every configured workflow (one row per
// organization × role category) with create / edit / activate / delete.
// Runtime still honors ONE active band-less flow per (org, category) — the
// editor warns before a save replaces an overlapping flow.
// Each step routes to a ROLE (custom_roles.role_key) or a PINNED USER, is
// typed review|final (last step must be final), and can require an interview
// before the step can be marked reviewed.
//
// Data: hr_approval_flows (flow_for='recruitment_approval'), frozen onto each
// candidate at promote-time (frozen-snapshot pattern R1.4) — editing a flow
// never rewrites in-flight candidates.
// ============================================================================

export const navMeta = {
  label: 'Recruitment Approval Flows',
  icon: 'GitBranch',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FlowBuilderClient } from './_components/flow-builder-client';

export default function RecruitmentApprovalFlowsPage() {
  return (
    <PermissionGuard
      module="hr.recruitment"
      action="edit"
      fallback={
        <ContentLayout title="Recruitment Approval Flows">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You need the <code>hr.recruitment.edit</code> permission to configure
            approval flows. Ask a super administrator to grant it via Role Management.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Recruitment Approval Flows — Who reviews, who finally approves">
        <FlowBuilderClient />
      </ContentLayout>
    </PermissionGuard>
  );
}
