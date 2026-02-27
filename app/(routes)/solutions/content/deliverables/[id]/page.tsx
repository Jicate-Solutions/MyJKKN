import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DeliverableDetail } from './_components/deliverable-detail';

export const metadata: Metadata = {
  title: 'Deliverable Detail | Solutions Hub',
  description: 'View and approve content deliverable',
};

export default async function DeliverableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ContentLayout title="Deliverable Detail">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Deliverables', href: '/solutions/content/deliverables' },
          { label: 'Detail' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <DeliverableDetail id={id} />
      </div>
    </ContentLayout>
  );
}
