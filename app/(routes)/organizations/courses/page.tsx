'use client';

import { useState, useCallback, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { CourseList } from './_components/course-list';
import { useCourses } from '@/hooks/organization/use-courses';
import { CourseFilters } from './_components/course-filters';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseFilters as CourseFilterType } from '@/types/organizations';
import DownloadCourseTemplateButton from './_components/download-course-template';
import { ExportCourses } from './_components/export-courses';
import BulkUploadCourses from './_components/bulk-upload-courses';

export default function CoursesPage() {
  const [filters, setFilters] = useState<CourseFilterType>({
    page: 1,
    limit: 10,
    search: '',
    institution_id: '',
    isActive: undefined
  });

  // Memoize the filter object to prevent unnecessary re-renders
  const memoizedFilters = useMemo(() => filters, [filters]);

  const {
    data: coursesData,
    isLoading: coursesLoading,
    error: coursesError,
    refetch: refetchCourses
  } = useCourses(memoizedFilters);

  // Separate handler for filter changes (resets page to 1)
  const handleFilterChange = useCallback(
    (newFilters: Partial<CourseFilterType>) => {
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

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');

  if (coursesError) {
    return (
      <ContentLayout title='Courses'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{coursesError.message}</p>
          <Button
            variant='outline'
            onClick={() => refetchCourses()}
            className='mt-4'
            disabled={!canViewCourses}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Courses'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations', href: '/organizations' },
          { label: 'Courses' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex items-center justify-between gap-2 w-full'>
          <div className='flex flex-col gap-2'>
            <h1 className='text-2xl font-bold py-1'>Courses</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage courses
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {canViewCourses && <DownloadCourseTemplateButton />}
            {isSuperAdmin && <ExportCourses />}
            {canViewCourses && <BulkUploadCourses />}
          </div>
        </div>

        <CourseFilters filters={filters} onFilterChange={handleFilterChange} />
        <CourseList
          courses={coursesData?.data || []}
          metadata={
            coursesData?.metadata || {
              total: 0,
              page: 1,
              limit: filters.limit || 10,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchCourses}
          paginationLoading={coursesLoading}
        />
      </div>
    </ContentLayout>
  );
}
