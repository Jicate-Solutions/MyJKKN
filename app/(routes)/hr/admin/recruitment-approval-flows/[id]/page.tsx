// Edit an existing recruitment approval workflow — dedicated route so the
// browser back button returns to the workflows table.

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { EditFlowClient } from '../_components/edit-flow-client';

export default async function EditRecruitmentApprovalFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGuard
      module="hr.recruitment"
      action="edit"
      fallback={
        <ContentLayout title="Edit Approval Workflow">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You need the <code>hr.recruitment.edit</code> permission to configure
            approval flows. Ask a super administrator to grant it via Role Management.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Edit Approval Workflow">
        <EditFlowClient flowId={id} />
      </ContentLayout>
    </PermissionGuard>
  );
}
