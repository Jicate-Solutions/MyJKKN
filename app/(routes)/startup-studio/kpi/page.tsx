import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { KpiDashboardView } from './_components/kpi-dashboard-view';

export const metadata: Metadata = {
  title: 'KPI Dashboard | Startup Studio',
};

export default function KpiDashboardPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'KPI Dashboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">KPI & Impact Framework</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track key performance indicators across DST, MSH, MoE, and NIRF frameworks
          </p>
        </div>
        <KpiDashboardView />
      </div>
    </ContentLayout>
  );
}
