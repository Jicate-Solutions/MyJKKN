import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SubmissionDetail } from './_components/submission-detail';

export const metadata: Metadata = {
  title: 'Submission Detail',
};

export default async function SubmissionDetailPage({
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
          { label: 'Submissions', href: '/startup-studio/submissions' },
          { label: 'Submission Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <SubmissionDetail id={id} />
      </div>
    </ContentLayout>
  );
}
