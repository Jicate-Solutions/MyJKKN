import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CohortList } from './_components/cohort-list';

export const metadata: Metadata = {
  title: 'Cohort Management | Solutions Hub',
  description: 'Manage training cohort members',
};

export default function CohortPage() {
  return (
    <ContentLayout title="Cohort Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training', href: '/solutions/training' },
          { label: 'Cohort' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Cohort Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage training cohort members and their progress
            </p>
          </div>
        </div>

        <CohortList />
      </div>
    </ContentLayout>
  );
}
