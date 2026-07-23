'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentsDataTable } from './_components/departments-data-table';
import { DepartmentFiltersClient } from './_components/department-filters-client';
import { departmentsSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

interface DepartmentsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function DepartmentsPage({ searchParams }: DepartmentsPageProps) {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = departmentsSearchParamsSchema.parse(params);

  const pageTitle = adapt('Departments');
  const helpText = adapt('Manage departments and their details');

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: pageTitle }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            {helpText}
          </p>
        </div>

        <DepartmentFiltersClient searchParams={search} />

        <DepartmentsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
