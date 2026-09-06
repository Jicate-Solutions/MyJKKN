import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { CohortsAdmin } from '../_components/cohorts-admin';

export const metadata: Metadata = {
  title: 'Cohorts — Foundations',
  description: 'Create and manage Foundations cohorts and their rosters',
};

export default function FoundationsCohortsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Foundations', href: '/startup-studio/foundations' },
          { label: 'Cohorts' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl mt-4" />}>
        <CohortsAdmin />
      </Suspense>
    </ContentLayout>
  );
}
