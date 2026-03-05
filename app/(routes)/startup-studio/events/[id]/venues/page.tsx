import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { VenuesDashboard } from './_components/venues-dashboard';

export const metadata: Metadata = {
  title: 'Venue Management | Startup Studio',
};

export default async function VenuesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Events', href: '/startup-studio/events' },
          { label: 'Venue Management' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <VenuesDashboard eventId={eventId} />
      </div>
    </ContentLayout>
  );
}
