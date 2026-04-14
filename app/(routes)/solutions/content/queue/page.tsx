import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ContentQueueList } from './_components/content-queue-list';

export const metadata: Metadata = {
  title: 'Work Queue | Solutions Hub',
  description: 'Content deliverables work queue',
};

export default function ContentQueuePage() {
  return (
    <ContentLayout title="Work Queue">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Queue' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Work Queue</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Content deliverables awaiting work or review
          </p>
        </div>

        <ContentQueueList />
      </div>
    </ContentLayout>
  );
}
