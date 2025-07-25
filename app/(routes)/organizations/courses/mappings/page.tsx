'use client';

import { useState, useCallback, useMemo } from 'react';
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseMappingList } from './_components/course-mapping-list';
import { CourseMappingFilters } from './_components/course-mapping-filters';
import BulkUploadCourseMappings from './_components/bulk-upload-course-mappings';
import DownloadCourseMappingTemplateButton from './_components/download-course-mapping-template';
import { CourseMappingFilters as CourseMappingFilterType } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CourseMappingsPage() {
  const [filters, setFilters] = useState<CourseMappingFilterType>({
    page: 1,
    limit: 10,
    search: '',
    institution_id: undefined,
    degree_id: undefined,
    department_id: undefined,
    program_id: undefined,
    semester_id: undefined,
    isActive: undefined
  });

  // Memoize the filter object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => filters, [filters]);

  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

  const {
    data: courseMappingsData,
    isLoading: courseMappingsLoading,
    error: courseMappingsError,
    refetch: refetchCourseMappings
  } = useCourseMappings(memoizedFilters);

  // Separate handler for filter changes (resets page to 1)
  const handleFilterChange = useCallback(
    (newFilters: Partial<CourseMappingFilterType>) => {
      setFilters((prev) => ({
        ...prev,
        ...newFilters,
        page: 1 // Always reset to page 1 when filters change
      }));
    },
    []
  );

  // Dedicated handler for page changes (doesn't reset page)
  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // Handler for page size changes (resets to page 1)
  const handlePageSizeChange = useCallback((limit: number) => {
    setFilters((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  if (courseMappingsError) {
    return (
      <ContentLayout title='Course Mappings'>
        <div className='text-center py-8 text-destructive'>
          {courseMappingsError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Course Mappings'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/organizations' },
          { label: 'Organizations' },
          { label: 'Courses', href: '/organizations/courses' },
          { label: 'Mappings', href: '/organizations/courses/mappings' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex flex-col gap-2'>
            <h1 className='text-2xl font-bold py-1'>Course Mappings</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage course mappings and prerequisites
            </p>
          </div>
          <div className='flex justify-end space-x-2 mt-4'>
            {canEditCourses && <DownloadCourseMappingTemplateButton />}
            {canEditCourses && <BulkUploadCourseMappings />}
          </div>
        </div>

        <CourseMappingFilters
          filters={filters}
          onFilterChange={handleFilterChange}
        />

        {/* Filter-based count display */}
        <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
          <div className='flex items-center gap-2'>
            <div className='flex items-center gap-1'>
              <Link2 className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium'>
                {courseMappingsLoading ? (
                  'Loading...'
                ) : (
                  <>
                    Showing {courseMappingsData?.data?.length || 0} of{' '}
                    <span className='font-semibold text-primary'>
                      {courseMappingsData?.metadata?.total || 0}
                    </span>{' '}
                    mapping
                    {courseMappingsData?.metadata?.total !== 1 ? 's' : ''}
                    {(courseMappingsData?.metadata?.total || 0) > 0 && (
                      <span className='text-muted-foreground'>
                        {' '}
                        (Page {courseMappingsData?.metadata?.page || 1} of{' '}
                        {courseMappingsData?.metadata?.totalPages || 1})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
            {!courseMappingsLoading &&
              (courseMappingsData?.metadata?.total || 0) > 0 && (
                <Badge variant='secondary' className='ml-2'>
                  {(
                    ((courseMappingsData?.data?.length || 0) /
                      (courseMappingsData?.metadata?.total || 1)) *
                    100
                  ).toFixed(1)}
                  % of total
                </Badge>
              )}
          </div>
          {!courseMappingsLoading &&
            (courseMappingsData?.metadata?.total || 0) === 0 && (
              <div className='text-sm text-muted-foreground'>
                No course mappings found matching the current filters
              </div>
            )}
        </div>

        <CourseMappingList
          courseMappings={courseMappingsData?.data || []}
          metadata={
            courseMappingsData?.metadata || {
              total: 0,
              page: 1,
              limit: filters.limit || 10,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchCourseMappings}
          paginationLoading={courseMappingsLoading}
        />
      </div>
    </ContentLayout>
  );
}
