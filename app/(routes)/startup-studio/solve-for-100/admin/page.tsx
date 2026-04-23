import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100AdminDashboard } from './_components/sf100-admin-dashboard';

export const metadata: Metadata = {
  title: 'Program Admin',
  description: 'Manage enrollments, verify paid users, and track phase progression',
};

export default function SF100AdminPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100?view=landing' },
          { label: 'Program Admin' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Program Admin</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage enrollments, verify paid users, and track phase progression
          </p>
        </div>
        <SF100AdminDashboard />
      </div>
    </ContentLayout>
  );
}
