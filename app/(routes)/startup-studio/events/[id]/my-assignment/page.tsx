import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AssignmentView } from './_components/assignment-view';

export const metadata: Metadata = {
  title: 'My Assignment | Startup Studio',
};

export default async function MyAssignmentPage({
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
          { label: 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Assignment' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <AssignmentView eventId={id} />
      </div>
    </ContentLayout>
  );
}
