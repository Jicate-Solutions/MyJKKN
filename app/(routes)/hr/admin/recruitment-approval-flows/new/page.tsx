// New recruitment approval workflow — dedicated route so the browser back
// button returns to the workflows table.

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CreateFlowClient } from '../_components/create-flow-client';

export default function NewRecruitmentApprovalFlowPage() {
  return (
    <PermissionGuard
      module="hr.recruitment"
      action="edit"
      fallback={
        <ContentLayout title="New Approval Workflow">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You need the <code>hr.recruitment.edit</code> permission to configure
            approval flows. Ask a super administrator to grant it via Role Management.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="New Approval Workflow">
        <CreateFlowClient />
      </ContentLayout>
    </PermissionGuard>
  );
}
