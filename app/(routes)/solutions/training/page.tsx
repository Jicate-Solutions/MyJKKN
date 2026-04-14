import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { TrainingOverview } from './_components/training-overview';

export const metadata: Metadata = {
  title: 'Training Programs | Solutions Hub',
  description: 'Manage training programs and sessions',
};

export default function TrainingPage() {
  return (
    <ContentLayout title="Training Programs">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Training' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Training Programs</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage training programs, sessions, and cohort members
          </p>
        </div>

        <TrainingOverview />
      </div>
    </ContentLayout>
  );
}
