import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { FinanceDashboard } from './_components/finance-dashboard';

export const metadata: Metadata = {
  title: 'Finance | Startup Studio',
};

export default function FinancePage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Finance' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Finance Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Grants, budgets, revenue tracking, and audit compliance for the incubation centre
          </p>
        </div>
        <FinanceDashboard />
      </div>
    </ContentLayout>
  );
}
