import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AudienceForm } from '../_components/audience-form';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/admin/notifications/audiences',
} as const;


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
