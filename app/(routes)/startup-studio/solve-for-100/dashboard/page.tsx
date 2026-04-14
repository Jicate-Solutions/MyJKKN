import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { SF100MyTeamDashboard } from './_components/sf100-my-team-dashboard';

export const metadata: Metadata = {
  title: 'My Team | Solve for 100',
  description: 'Your team\'s progress, check-ins, customers, interviews, and pivots — all in one place',
};

export default function SF100DashboardPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'My Team' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">My Team</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your progress, check-ins, paid users, interviews, and pivots — all in one place
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <SF100MyTeamDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
