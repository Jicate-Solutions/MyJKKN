import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SolutionsDashboard } from './_components/solutions-dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | Solutions Hub',
  description: 'Overview of all solutions across software, training, and content',
};

export default function SolutionsPage() {
  return (
    <ContentLayout title="Solutions Hub">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Solutions Hub</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage all JKKN solutions - software, training, and content production
          </p>
        </div>

        <SolutionsDashboard />
      </div>
    </ContentLayout>
  );
}
