// app/(routes)/organizations/departments/page.tsx

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentsDataTable } from './_components/departments-data-table';
import { DepartmentFiltersClient } from './_components/department-filters-client';
import { departmentsSearchParamsSchema } from './_components/data-table-schema';

interface DepartmentsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DepartmentsPage({ searchParams }: DepartmentsPageProps) {
  const params = await searchParams;
  const search = departmentsSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Departments'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Departments' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Departments</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage departments and their details
          </p>
        </div>

        <DepartmentFiltersClient searchParams={search} />

        <DepartmentsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
