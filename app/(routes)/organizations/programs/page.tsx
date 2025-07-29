'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramsDataTable } from './_components/programs-data-table';
import { ProgramFilters } from './_components/program-filters';
import { programsSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export default function ProgramsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse current search parameters
  const search = programsSearchParamsSchema.parse(
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

      router.push(`/organizations/programs?${params.toString()}`);
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
    router.push(`/organizations/programs?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <ContentLayout title='Programs'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Programs' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Programs</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic programs
          </p>
        </div>

        {/* Filters */}
        <ProgramFilters
          searchParams={search}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        {/* Data Table */}
        <ProgramsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
