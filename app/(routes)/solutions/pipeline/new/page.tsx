import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewProspectForm } from './_components/new-prospect-form';

export const metadata: Metadata = {
  title: 'New Prospect | Solutions Hub',
  description: 'Add a new prospect to the pipeline',
};

export default function NewProspectPage() {
  return (
    <ContentLayout title="New Prospect">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Pipeline', href: '/solutions/pipeline' },
          { label: 'New Prospect' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Add New Prospect</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Add a new prospect to the sales pipeline
          </p>
        </div>

        <NewProspectForm />
      </div>
    </ContentLayout>
  );
}
