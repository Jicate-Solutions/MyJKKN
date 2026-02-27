import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { EventDetail } from './_components/event-detail';

export const metadata: Metadata = {
  title: 'Event Detail | Startup Studio',
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Events', href: '/startup-studio/events' },
          { label: 'Event Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <EventDetail id={id} />
      </div>
    </ContentLayout>
  );
}
