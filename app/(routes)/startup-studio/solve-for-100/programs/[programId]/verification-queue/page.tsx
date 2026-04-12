import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100VerificationQueue } from './_components/sf100-verification-queue';

export const metadata: Metadata = {
  title: 'Verification Queue | Solve for 100',
};

interface SF100VerificationQueuePageProps {
  params: { programId: string };
}

export default function SF100VerificationQueuePage({ params }: SF100VerificationQueuePageProps) {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Programs', href: '/startup-studio/solve-for-100/programs' },
          {
            label: 'Program',
            href: `/startup-studio/solve-for-100/programs/${params.programId}`,
          },
          { label: 'Verification Queue' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Verification Queue</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Review and verify pending paid user submissions
          </p>
        </div>
        <SF100VerificationQueue programId={params.programId} />
      </div>
    </ContentLayout>
  );
}
