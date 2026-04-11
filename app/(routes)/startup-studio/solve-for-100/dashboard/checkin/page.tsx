import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100CheckInForm } from '../../_components/sf100-checkin-form';

export const metadata: Metadata = {
  title: 'Submit Check-in | Solve for 100',
};

interface SF100CheckInPageProps {
  searchParams: { enrollmentId?: string };
}

export default function SF100CheckInPage({ searchParams }: SF100CheckInPageProps) {
  const enrollmentId = searchParams.enrollmentId ?? '';

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Dashboard', href: '/startup-studio/solve-for-100/dashboard' },
          { label: 'Submit Check-in' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Submit Check-in</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Log your weekly progress or a quick micro-update
          </p>
        </div>
        <div className="max-w-2xl">
          <SF100CheckInForm enrollmentId={enrollmentId} />
        </div>
      </div>
    </ContentLayout>
  );
}
