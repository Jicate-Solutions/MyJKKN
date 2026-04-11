import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100TeamDashboard } from '../_components/sf100-team-dashboard';

export const metadata: Metadata = {
  title: 'Team Dashboard | Solve for 100',
  description: 'Track your team\'s paid users, phase progress, and weekly check-ins',
};

export default function SF100DashboardPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Team Dashboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Team Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track paid users, phase progress, and weekly check-ins for your team
          </p>
        </div>
        <SF100TeamDashboard />
      </div>
    </ContentLayout>
  );
}
