import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { SF100MentorDashboard } from './_components/sf100-mentor-dashboard';

export const metadata: Metadata = {
  title: 'Mentor Dashboard | Solve for 100',
  description: 'Review check-ins, track assigned teams, and flag teams that need attention',
};

export default function SF100MentorPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100?view=landing' },
          { label: 'Mentor Dashboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Mentor Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Prioritize teams that need your attention, review check-ins, and track progress
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <SF100MentorDashboard />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
