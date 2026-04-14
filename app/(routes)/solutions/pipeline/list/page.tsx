import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProspectList } from './_components/prospect-list';

export const metadata: Metadata = {
  title: 'Prospect List | Solutions Hub',
  description: 'View and manage all prospects in the pipeline',
};

export default function ProspectListPage() {
  return (
    <ContentLayout title="Prospect List">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline', href: '/solutions/pipeline' },
          { label: 'List View' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <ProspectList />
      </div>
    </ContentLayout>
  );
}
