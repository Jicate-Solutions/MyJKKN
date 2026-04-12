import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SubmissionsList } from './_components/submissions-list';

export const metadata: Metadata = {
  title: 'Submissions | Startup Studio',
};

export default function SubmissionsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Submissions' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Submissions</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Review and manage appathon submissions and judging
          </p>
        </div>
        <SubmissionsList />
      </div>
    </ContentLayout>
  );
}
