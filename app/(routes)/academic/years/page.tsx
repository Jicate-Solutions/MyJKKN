// app/(routes)/academic/years/page.tsx

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AcademicYearsDataTable } from './_components/academic-year-data-table';
import { academicYearsSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { AcademicYearFilters } from './_components/academic-year-filters';
import { PermissionGuard } from '@/components/auth/permission-guard';

export default function AcademicYearsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse current search parameters
  const search = academicYearsSearchParamsSchema.parse(
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

      router.push(`/academic/years?${params.toString()}`);
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
    router.push(`/academic/years?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='academic.years' action='view'>
      <ContentLayout title='Academic Years'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Academic' },
            { label: 'Academic Years' }
          ]}
        />
        <div className='space-y-6 mt-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Academic Years</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic years for your institutions
            </p>
          </div>

          {/* Filters */}
          <AcademicYearFilters
            searchParams={search}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
          />

          {/* Data Table */}
          <AcademicYearsDataTable search={search} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
