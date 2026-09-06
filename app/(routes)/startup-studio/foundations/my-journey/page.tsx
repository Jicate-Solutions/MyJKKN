import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { MyJourney } from '../_components/my-journey';

export const metadata: Metadata = {
  title: 'My Journey — Foundations',
  description: 'Work through the Foundations worksheets and track your Level-0 progress',
};

export default function FoundationsMyJourneyPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Foundations', href: '/startup-studio/foundations' },
          { label: 'My Journey' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl mt-4" />}>
        <MyJourney />
      </Suspense>
    </ContentLayout>
  );
}
