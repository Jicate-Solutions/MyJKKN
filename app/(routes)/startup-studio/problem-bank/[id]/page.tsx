import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProblemDetail } from './_components/problem-detail';

export const metadata: Metadata = {
  title: 'Problem Detail | Startup Studio',
};

export default async function ProblemDetailPage({
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
          { label: 'Problem Bank', href: '/startup-studio/problem-bank' },
          { label: 'Problem Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <ProblemDetail id={id} />
      </div>
    </ContentLayout>
  );
}
