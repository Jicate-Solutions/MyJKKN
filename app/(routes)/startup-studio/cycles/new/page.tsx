import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { NewCycleForm } from './_components/new-cycle-form';

export const metadata: Metadata = {
  title: 'New Cycle | Startup Studio',
  description: 'Start a new innovation cycle',
};

export default function NewCyclePage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Cycles', href: '/startup-studio/cycles' },
          { label: 'New Cycle' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Start New Cycle</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create a new innovation cycle to begin problem discovery
          </p>
        </div>
        <NewCycleForm />
      </div>
    </ContentLayout>
  );
}
