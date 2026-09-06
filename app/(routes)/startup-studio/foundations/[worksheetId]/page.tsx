import { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { WorksheetFill } from '../_components/worksheet-fill';

export const metadata: Metadata = {
  title: 'Worksheet — Foundations',
  description: 'Complete a Foundations worksheet',
};

export default async function FoundationsWorksheetPage({
  params,
}: {
  params: Promise<{ worksheetId: string }>;
}) {
  const { worksheetId } = await params;
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Foundations', href: '/startup-studio/foundations' },
          { label: 'My Journey', href: '/startup-studio/foundations/my-journey' },
          { label: 'Worksheet' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl mt-4" />}>
        <WorksheetFill worksheetId={worksheetId} />
      </Suspense>
    </ContentLayout>
  );
}
