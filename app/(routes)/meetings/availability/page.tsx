// app/(routes)/meetings/availability/page.tsx
//
// Option 4 — embeds jicate-booking availability/schedule UI inside MyJKKN.
// User stays in MyJKKN; sees Cal.com availability editor inside an iframe.
//
// Spec: Option 4 of the parallel architecture batch (2026-05-03 ~07:42 IST)

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { JicateBookingEmbed } from '@/components/jicate-booking';

export default function MeetingsAvailabilityPage() {
  return (
    <ContentLayout title="My Availability">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Availability' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="My Availability"
          description="Set the times you're available for bookings. Powered by jicate-booking — changes save automatically."
        />
        <p className="text-xs text-muted-foreground">
          First-visit: you may see a Cal.com sign-in prompt — sign in once with the same email as your MyJKKN account.
        </p>
        <Card className="p-0 overflow-hidden">
          <JicateBookingEmbed mode="availability" height={900} />
        </Card>
      </div>
    </ContentLayout>
  );
}
