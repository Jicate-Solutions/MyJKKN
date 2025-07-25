'use client';

import { useState } from 'react';
import { usePrograms } from '@/hooks/organization/use-programs';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramList } from './_components/program-list';
import { ProgramFilters } from './_components/program-filters';
import { ProgramFilters as ProgramFilterType } from '@/types/organizations';
import { BookMarked } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ProgramsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<ProgramFilterType>>({});

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
        <ProgramFilters onFilterChange={handleFilterChange} filters={filters} />

        {/* Filter-based count display */}
        <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1'>
              <BookMarked className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium'>
                {programsLoading ? (
                  'Loading...'
                ) : (
                  <>
                    Showing {programsData?.data?.length || 0} of{' '}
                    <span className='font-semibold text-primary'>
                      {programsData?.metadata?.total || 0}
                    </span>{' '}
                    program{programsData?.metadata?.total !== 1 ? 's' : ''}
                    {(programsData?.metadata?.total || 0) > 0 && (
                      <span className='text-muted-foreground'>
                        {' '}
                        (Page {programsData?.metadata?.page || 1} of{' '}
                        {programsData?.metadata?.totalPages || 1})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            {!programsLoading && (programsData?.metadata?.total || 0) > 0 && (
              <Badge variant='secondary' className='ml-2'>
                {(
                  ((programsData?.data?.length || 0) /
                    (programsData?.metadata?.total || 1)) *
                  100
                ).toFixed(1)}
                % of total
              </Badge>
            )}
          </div>
          {!programsLoading && (programsData?.metadata?.total || 0) === 0 && (
            <div className='text-sm text-muted-foreground'>
              No programs found matching the current filters
            </div>
          )}
        </div>

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
