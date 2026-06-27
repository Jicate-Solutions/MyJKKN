import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewQueue } from '../_components/review-queue';

export const metadata: Metadata = {
  title: 'Review — Foundations',
  description: 'Review learner worksheet submissions and leave mentor feedback',
};

export default function FoundationsReviewPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Foundations', href: '/startup-studio/foundations' },
          { label: 'Review' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl mt-4" />}>
        <ReviewQueue />
      </Suspense>
    </ContentLayout>
  );
}
