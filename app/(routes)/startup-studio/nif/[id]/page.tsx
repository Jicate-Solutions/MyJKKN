import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NifCandidateDetail } from './_components/nif-candidate-detail';

export const metadata: Metadata = {
  title: 'NIF Candidate | Startup Studio',
};

export default async function NifCandidateDetailPage({
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
          { label: 'NIF Pipeline', href: '/startup-studio/nif' },
          { label: 'Candidate Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <NifCandidateDetail id={id} />
      </div>
    </ContentLayout>
  );
}
