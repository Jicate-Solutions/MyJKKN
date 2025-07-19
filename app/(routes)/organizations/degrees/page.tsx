// app/(routes)/organizations/degrees/page.tsx

'use client';

import { useState } from 'react';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DegreeList } from './_components/degree-list';
import { DegreeFilters } from './_components/degree-filters';
import { DegreeFilters as DegreeFilterType } from '@/types/organizations';

export default function DegreesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<DegreeFilterType>>({
    isActive: true
  });

  const {
    data: degreesData,
    isLoading: degreesLoading,
    error: degreesError,
    refetch: refetchDegrees
  } = useDegrees({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<DegreeFilterType>) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  if (degreesError) {
    return (
      <ContentLayout title='Degrees'>
        <div className='text-center py-8 text-destructive'>
          {degreesError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Degrees'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Degrees' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Degrees</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic degrees
          </p>
        </div>
        <DegreeFilters onFilterChange={handleFilterChange} filters={filters} />
        <DegreeList
          degrees={degreesData?.data || []}
          metadata={
            degreesData?.metadata || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchDegrees}
          paginationLoading={degreesLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
