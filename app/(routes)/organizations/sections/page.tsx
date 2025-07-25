'use client';

import { useState } from 'react';
import { useSections } from '@/hooks/organization/use-sections';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SectionList } from './_components/section-list';
import { SectionFilters } from './_components/section-filters';
import { SectionFilters as SectionFilterType } from '@/types/organizations';
import { FolderTree } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SectionsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<SectionFilterType>>({});

  const {
    data: sectionsData,
    isLoading: sectionsLoading,
    isFetching: sectionsFetching,
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
        <SectionFilters onFilterChange={handleFilterChange} filters={filters} />

        {/* Filter-based count display */}
        <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1'>
              <FolderTree className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium'>
                {sectionsLoading || sectionsFetching ? (
                  'Loading...'
                ) : (
                  <>
                    Showing {sectionsData?.data?.length || 0} of{' '}
                    <span className='font-semibold text-primary'>
                      {sectionsData?.metadata?.total || 0}
                    </span>{' '}
                    section{sectionsData?.metadata?.total !== 1 ? 's' : ''}
                    {(sectionsData?.metadata?.total || 0) > 0 && (
                      <span className='text-muted-foreground'>
                        {' '}
                        (Page {sectionsData?.metadata?.page || 1} of{' '}
                        {sectionsData?.metadata?.totalPages || 1})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            {!sectionsLoading && (sectionsData?.metadata?.total || 0) > 0 && (
              <Badge variant='secondary' className='ml-2'>
                {(
                  ((sectionsData?.data?.length || 0) /
                    (sectionsData?.metadata?.total || 1)) *
                  100
                ).toFixed(1)}
                % of total
              </Badge>
            )}
          </div>
          {!sectionsLoading && (sectionsData?.metadata?.total || 0) === 0 && (
            <div className='text-sm text-muted-foreground'>
              No sections found matching the current filters
            </div>
          )}
        </div>

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
          paginationLoading={sectionsLoading || sectionsFetching}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
