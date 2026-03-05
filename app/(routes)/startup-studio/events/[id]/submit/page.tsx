import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SubmissionForm } from './_components/submission-form';

export const metadata: Metadata = {
  title: 'Submit Project | Startup Studio',
};

export default async function SubmitProjectPage({
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
          { label: 'Submit Project' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <SubmissionForm eventId={id} />
      </div>
    </ContentLayout>
  );
}
