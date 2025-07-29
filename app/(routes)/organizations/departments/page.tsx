// app/(routes)/organizations/departments/page.tsx

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentsDataTable } from './_components/departments-data-table';
import { DepartmentFilters } from './_components/department-filters';
import { departmentsSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export default function DepartmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse current search parameters
  const search = departmentsSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/organizations/departments?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep only page and pageSize
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/organizations/departments?${params.toString()}`);
  }, [router, searchParams]);

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

        {/* Filters */}
        <DepartmentFilters
          searchParams={search}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        {/* Data Table */}
        <DepartmentsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
