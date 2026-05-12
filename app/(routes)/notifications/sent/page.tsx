// app/(routes)/notifications/sent/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { SentOutbox } from '@/components/notifications/sent-outbox';

export default function NotificationsSentPage() {
  return (
    <ContentLayout title="Sent">
      <div className="max-w-4xl mx-auto pb-24">
        <SentOutbox />
      </div>
    </ContentLayout>
  );
}
