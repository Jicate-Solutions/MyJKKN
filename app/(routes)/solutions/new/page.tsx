import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewSolutionForm } from './_components/new-solution-form';

export const metadata: Metadata = {
  title: 'New Solution | Solutions Hub',
  description: 'Create a new solution',
};

export default function NewSolutionPage() {
  return (
    <ContentLayout title="New Solution">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'New Solution' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Create New Solution</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create a new software, training, or content solution
          </p>
        </div>

        <NewSolutionForm />
      </div>
    </ContentLayout>
  );
}
