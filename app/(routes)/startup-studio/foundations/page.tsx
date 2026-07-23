import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationsHome } from './_components/foundations-home';

export const metadata: Metadata = {
  title: 'Foundations',
  description: 'Startup Studio Foundations (Level 0) — your pre-Appathon founder-formation on-ramp',
};

export default function FoundationsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Foundations' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl mt-4" />}>
        <FoundationsHome />
      </Suspense>
    </ContentLayout>
  );
}
