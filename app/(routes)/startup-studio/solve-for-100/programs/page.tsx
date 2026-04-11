import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SF100ProgramList } from './_components/sf100-program-list';

export const metadata: Metadata = {
  title: 'Solve for 100 — Programs | Startup Studio',
};

export default function SF100ProgramsPage() {
  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'Solve for 100', href: '/startup-studio/solve-for-100' },
          { label: 'Programs' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Solve for 100 — Programs</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage and monitor all Solve for 100 program cohorts
          </p>
        </div>
        <SF100ProgramList />
      </div>
    </ContentLayout>
  );
}
