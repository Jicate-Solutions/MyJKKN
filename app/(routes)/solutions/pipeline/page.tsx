import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PipelineBoard } from './_components/pipeline-board';

export const metadata: Metadata = {
  title: 'Pipeline Board | Solutions Hub',
  description: 'Manage prospects through the sales pipeline',
};

export default function PipelineBoardPage() {
  return (
    <ContentLayout title="Pipeline Board">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline Board' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <PipelineBoard />
      </div>
    </ContentLayout>
  );
}
