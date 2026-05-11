// app/(routes)/meetings/manage/page.tsx
//
// Option 4 — embeds jicate-booking event-types management inside MyJKKN.
// User stays in MyJKKN; sees Cal.com event-types editor inside an iframe.
// Replaces the external "Manage on jicate-booking" deep-link.
//
// Spec: Option 4 of the parallel architecture batch (2026-05-03 ~07:42 IST)
// Companion: components/jicate-booking/embed.tsx (Agent A)

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { JicateBookingEmbed } from '@/components/jicate-booking';

export default function MeetingsManagePage() {
  return (
    <ContentLayout title="Manage Meeting Types">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Manage Event Types' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="Manage Meeting Types"
          description="Configure your bookable event types and availability. Powered by jicate-booking — your changes save automatically."
        />
        <p className="text-xs text-muted-foreground">
          First-visit: you may see a Cal.com sign-in prompt inside the panel below — sign in once with the same email as your MyJKKN account.
          Subsequent visits load directly into the editor.
        </p>
        <Card className="p-0 overflow-hidden">
          <JicateBookingEmbed mode="event-types" height={900} />
        </Card>
      </div>
    </ContentLayout>
  );
}
