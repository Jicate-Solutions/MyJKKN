import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100EnrollmentsTable } from './_components/sf100-enrollments-table';

export const metadata: Metadata = {
  title: 'Enrollments | Solve for 100',
};

interface SF100EnrollmentsPageProps {
  params: { programId: string };
}

export default function SF100EnrollmentsPage({ params }: SF100EnrollmentsPageProps) {
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
          { label: 'Enrollments' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Enrollments</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            All enrolled teams for this program
          </p>
        </div>
        <SF100EnrollmentsTable programId={params.programId} />
      </div>
    </ContentLayout>
  );
}
