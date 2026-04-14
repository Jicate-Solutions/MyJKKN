import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ContentOverview } from './_components/content-overview';

export const metadata: Metadata = {
  title: 'Content Production | Solutions Hub',
  description: 'Manage content production orders and deliverables',
};

export default function ContentPage() {
  return (
    <ContentLayout title="Content Production">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Content Production</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage content orders, deliverables, and production learners
          </p>
        </div>

        <ContentOverview />
      </div>
    </ContentLayout>
  );
}
