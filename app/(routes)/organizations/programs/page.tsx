'use client';

import { useState } from 'react';
import { usePrograms } from '@/hooks/organization/use-programs';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramList } from './_components/program-list';
import { ProgramFilters } from './_components/program-filters';
import { ProgramFilters as ProgramFilterType } from '@/types/organizations';

export default function ProgramsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<ProgramFilterType>>({
    isActive: true
  });

  const {
    data: programsData,
    isLoading: programsLoading,
    error: programsError,
    refetch: refetchPrograms
  } = usePrograms({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<ProgramFilterType>) => {
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

  if (programsError) {
    return (
      <ContentLayout title='Programs'>
        <div className='text-center py-8 text-destructive'>
          {programsError.message}
        </div>
      </ContentLayout>
    );
  }

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
        <ProgramFilters filters={filters} onFilterChange={handleFilterChange} />
        <ProgramList
          programs={programsData?.data || []}
          metadata={
            programsData?.metadata || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchPrograms}
          paginationLoading={programsLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
