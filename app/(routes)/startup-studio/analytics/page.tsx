import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SSAnalytics } from './_components/ss-analytics';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Analytics' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Analytics</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Comprehensive metrics and insights across the Startup Studio
          </p>
        </div>
        <SSAnalytics />
      </div>
    </ContentLayout>
  );
}
