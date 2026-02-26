// app/(routes)/jkkn-api/departments/page.tsx
// Server component — layout shell only. Data fetching is handled client-side
// inside DepartmentsTable via React Query.

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentsTable } from './_components/departments-table';

export const metadata = {
  title: 'JKKN API – Departments',
};

export default function JkknDepartmentsPage() {
  return (
    <ContentLayout title="JKKN Departments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'JKKN API' },
          { label: 'Departments' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Departments</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Live data from the JKKN central API — all departments across the
            network.
          </p>
        </div>

        <DepartmentsTable />
      </div>
    </ContentLayout>
  );
}
