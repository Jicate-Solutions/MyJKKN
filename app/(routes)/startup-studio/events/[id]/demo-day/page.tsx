import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DemoSchedule } from './_components/demo-schedule';

export const metadata: Metadata = {
  title: 'Demo Day | Startup Studio',
};

export default async function DemoDayPage({
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
          { label: 'Demo Day' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <DemoSchedule eventId={id} />
      </div>
    </ContentLayout>
  );
}
