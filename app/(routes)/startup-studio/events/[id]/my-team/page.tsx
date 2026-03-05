import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { MyTeamView } from './_components/my-team-view';

export const metadata: Metadata = {
  title: 'My Team | Startup Studio',
};

export default async function MyTeamPage({
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
          { label: 'My Team' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <MyTeamView eventId={id} />
      </div>
    </ContentLayout>
  );
}
