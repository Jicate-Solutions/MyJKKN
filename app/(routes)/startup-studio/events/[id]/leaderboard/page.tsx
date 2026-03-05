import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LeaderboardView } from './_components/leaderboard-view';

export const metadata: Metadata = {
  title: 'Leaderboard | Startup Studio',
};

export default async function LeaderboardPage({
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
          { label: 'Leaderboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <LeaderboardView eventId={eventId} />
      </div>
    </ContentLayout>
  );
}
