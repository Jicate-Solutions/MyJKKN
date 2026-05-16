import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { RecipientPoliciesClient } from './_components/recipient-policies-client';

/**
 * /admin/notifications/recipients
 *
 * Director's standing rule (2026-04-29):
 *   "Re-map CEO's digest categories? Click checkboxes" — verbatim Director example.
 *
 * Super_admin-only UI for editing notification_recipient_policies. Each row is
 * a digest category (e.g. super_admin_daily.escalation, hr_command_brief). The
 * Director ticks role checkboxes, optionally adds individual email overrides,
 * and saves. Digest fan-out functions consume the new mapping on the next run.
 */
export default function NotificationRecipientsPage() {
  return (
    <PermissionGuard
      module='notifications'
      action={['view', 'view.all']}
      anyAction
    >
      <ContentLayout title='Notification Recipients'>
        <RecipientPoliciesClient />
      </ContentLayout>
    </PermissionGuard>
  );
}
