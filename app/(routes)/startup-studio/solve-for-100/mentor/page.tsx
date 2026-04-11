import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100MentorDashboard } from './_components/sf100-mentor-dashboard';

export const metadata: Metadata = {
  title: 'Mentor Dashboard | Solve for 100',
};

export default function SF100MentorPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Mentor Dashboard' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Mentor Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Review check-ins and track progress for your assigned teams
          </p>
        </div>
        <SF100MentorDashboard />
      </div>
    </ContentLayout>
  );
}
