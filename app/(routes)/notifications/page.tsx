'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { NotificationCenter } from './_components/notification-center';

export default function NotificationsPage() {
  return (
    <ContentLayout title='Notifications'>
      <NotificationCenter />
    </ContentLayout>
  );
}
