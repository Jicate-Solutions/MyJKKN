'use client';

import { useState } from 'react';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemesterList } from './_components/semester-list';
import { SemesterFilters } from './_components/semester-filters';
import { SemesterFilters as SemesterFilterType } from '@/types/organizations';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
          onFilterChange={handleFilterChange}
          filters={filters}
        />

        {/* Filter-based count display */}
        <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1'>
              <Calendar className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium'>
                {semestersLoading ? (
                  'Loading...'
                ) : (
                  <>
                    Showing {semestersData?.data?.length || 0} of{' '}
                    <span className='font-semibold text-primary'>
                      {semestersData?.metadata?.total || 0}
                    </span>{' '}
                    semester{semestersData?.metadata?.total !== 1 ? 's' : ''}
                    {(semestersData?.metadata?.total || 0) > 0 && (
                      <span className='text-muted-foreground'>
                        {' '}
                        (Page {semestersData?.metadata?.page || 1} of{' '}
                        {semestersData?.metadata?.totalPages || 1})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            {!semestersLoading && (semestersData?.metadata?.total || 0) > 0 && (
              <Badge variant='secondary' className='ml-2'>
                {(
                  ((semestersData?.data?.length || 0) /
                    (semestersData?.metadata?.total || 1)) *
                  100
                ).toFixed(1)}
                % of total
              </Badge>
            )}
          </div>
          {!semestersLoading && (semestersData?.metadata?.total || 0) === 0 && (
            <div className='text-sm text-muted-foreground'>
              No semesters found matching the current filters
            </div>
          )}
        </div>

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
