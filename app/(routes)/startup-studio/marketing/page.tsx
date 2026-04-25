import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { MarketingDashboard } from './_components/marketing-dashboard';

export const metadata: Metadata = {
  title: 'Marketing & Outreach',
};

export default function MarketingPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Marketing & Outreach' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Marketing & Outreach</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Plan, track, and analyze marketing activities for the startup studio
          </p>
        </div>
        <MarketingDashboard />
      </div>
    </ContentLayout>
  );
}
