import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { GovernanceDashboard } from './_components/governance-dashboard';

export const metadata: Metadata = {
  title: 'Governance | Startup Studio',
};

export default function GovernancePage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Governance' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Governance & Compliance</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Board management, regulatory compliance tracking, and institutional readiness assessments
          </p>
        </div>
        <GovernanceDashboard />
      </div>
    </ContentLayout>
  );
}
