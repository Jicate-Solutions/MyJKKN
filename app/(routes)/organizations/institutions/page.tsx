// app/(routes)/organizations/institutions/page.tsx
'use client';

import { useState } from 'react';
import { useInstitutions } from '@/hooks/organization/use-institutions';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InstitutionList } from './_components/institution-list';
import { InstitutionFilter } from './_components/institution-filters';
import { InstitutionFilters } from '@/types/organizations';

export default function InstitutionsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<InstitutionFilters>>({
    isActive: true
  });

  const {
    data: institutionsData,
    isLoading: institutionsLoading,
    error: institutionsError,
    refetch: refetchInstitutions
  } = useInstitutions({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<InstitutionFilters>) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1); // Reset to first page
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1); // Reset to first page when searching
  };

  if (institutionsError) {
    return (
      <ContentLayout title='Institutions'>
        <div className='text-center py-8 text-destructive'>
          {institutionsError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Institutions'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Institutions' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Institutions</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage institutions and their details
          </p>
        </div>

        <InstitutionFilter
          onFilterChange={handleFilterChange}
          filters={filters}
        />
        <InstitutionList
          institutions={institutionsData?.data || []}
          metadata={
            institutionsData?.metadata || {
              total: 0,
              page: 1,
              limit: pageSize,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchInstitutions}
          paginationLoading={institutionsLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
