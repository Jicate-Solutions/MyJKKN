'use client';

import { useState } from 'react';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemesterList } from './_components/semester-list';
import { SemesterFilters } from './_components/semester-filters';
import { SemesterFilters as SemesterFilterType } from '@/types/organizations';

export default function SemestersPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<SemesterFilterType>>({});

  const {
    data: semestersData,
    isLoading: semestersLoading,
    error: semestersError,
    refetch: refetchSemesters
  } = useSemesters({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<SemesterFilterType>) => {
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

  if (semestersError) {
    return (
      <ContentLayout title='Semesters'>
        <div className='text-center py-8 text-destructive'>
          {semestersError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Semesters'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Semesters' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Semesters</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic semesters
          </p>
        </div>
        <SemesterFilters
          filters={filters}
          onFilterChange={handleFilterChange}
        />
        <SemesterList
          semesters={semestersData?.data || []}
          metadata={
            semestersData?.metadata || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchSemesters}
          paginationLoading={semestersLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
