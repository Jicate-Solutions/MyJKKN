import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { EventsList } from './_components/events-list';

export const metadata: Metadata = {
  title: 'Events | Startup Studio',
};

export default function EventsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Events' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Events</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage hackathons, sprints, and innovation events
          </p>
        </div>
        <EventsList />
      </div>
    </ContentLayout>
  );
}
