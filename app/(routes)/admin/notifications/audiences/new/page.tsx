import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AudienceForm } from '../_components/audience-form';

export default function NewAudiencePage() {
  return (
    <PermissionGuard
      module='notifications'
      action={['create', 'send']}
      anyAction
    >
      <ContentLayout title='Create Audience'>
        <AudienceForm />
      </ContentLayout>
    </PermissionGuard>
  );
}
