import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ImpactReportsView } from './_components/impact-reports-view';

export const metadata: Metadata = {
  title: 'Impact Reports',
};

/**
 * navMeta — invoked from the KPI Dashboard via a "View Impact Reports" CTA
 * for funders / board. Nav-coverage detector
 * (`scripts/assert-nav-coverage.mjs`) reads this to pass discoverability.
 */
export const navMeta = {
  invokedFrom: '/startup-studio/kpi',
} as const;

export default function ImpactReportsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'KPI Dashboard', href: '/startup-studio/kpi' },
          { label: 'Impact Reports' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Impact Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Generate and manage impact reports for funders, board, and stakeholders
          </p>
        </div>
        <ImpactReportsView />
      </div>
    </ContentLayout>
  );
}
