import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ComplianceDashboard } from './_components/compliance-dashboard';

export default function CompliancePage() {
  return (
    <PermissionGuard module='notifications' action={['view', 'view.all']} anyAction>
      <ContentLayout title='Acknowledgment Compliance'>
        <ComplianceDashboard />
      </ContentLayout>
    </PermissionGuard>
  );
}
