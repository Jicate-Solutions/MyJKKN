import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PortfolioDashboard } from './_components/portfolio-dashboard';

export const metadata: Metadata = {
  title: 'Portfolio Intelligence | Startup Studio',
};

export default function PortfolioPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Portfolio Intelligence' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Portfolio Intelligence</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            TRL tracking, risk assessment, and portfolio-wide analytics for incubated startups
          </p>
        </div>
        <PortfolioDashboard />
      </div>
    </ContentLayout>
  );
}
