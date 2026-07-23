import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AudienceList } from './_components/audience-list';

export default function AudiencesPage() {
  return (
    <PermissionGuard
      module='notifications'
      action={['view', 'view.all']}
      anyAction
    >
      <ContentLayout title='Notification Audiences'>
        <AudienceList />
      </ContentLayout>
    </PermissionGuard>
  );
}
