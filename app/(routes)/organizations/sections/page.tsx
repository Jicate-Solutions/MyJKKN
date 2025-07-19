'use client';

import { useState } from 'react';
import { useSections } from '@/hooks/organization/use-sections';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SectionList } from './_components/section-list';
import { SectionFilters } from './_components/section-filters';
import { SectionFilters as SectionFilterType } from '@/types/organizations';

export default function SectionsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<SectionFilterType>>({});

  const {
    data: sectionsData,
    isLoading: sectionsLoading,
    error: sectionsError,
    refetch: refetchSections
  } = useSections({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<SectionFilterType>) => {
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

  if (sectionsError) {
    return (
      <ContentLayout title='Sections'>
        <div className='text-center py-8 text-destructive'>
          {sectionsError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Sections'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Sections' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Sections</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic sections
          </p>
        </div>
        <SectionFilters filters={filters} onFilterChange={handleFilterChange} />
        <SectionList
          sections={sectionsData?.data || []}
          metadata={
            sectionsData?.metadata || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchSections}
          paginationLoading={sectionsLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
