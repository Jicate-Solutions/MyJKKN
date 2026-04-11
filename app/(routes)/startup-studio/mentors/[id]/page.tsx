import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { MentorDetail } from './_components/mentor-detail';

export const metadata: Metadata = {
  title: 'Mentor Detail | Startup Studio',
};

export default async function MentorDetailPage({
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
          { label: 'Mentor Network', href: '/startup-studio/mentors' },
          { label: 'Mentor Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <MentorDetail id={id} />
      </div>
    </ContentLayout>
  );
}
