'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { CourseList } from './_components/course-list';
import { useCourses } from '@/hooks/organization/use-courses';
import { CourseFilters } from './_components/course-filters';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseFilters as CourseFilterType } from '@/types/organizations';

export default function CoursesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<CourseFilterType>({
    search: '',
    institution_id: '',
    isActive: true,
    page: 1,
    limit: 10,
    userId: ''
  });

  const updateFilters = (newFilters: Partial<CourseFilterType>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const {
    data: coursesData,
    isLoading: coursesLoading,
    error: coursesError,
    refetch: refetchCourses
  } = useCourses({
    page,
    limit: pageSize,
    search: searchQuery
  });

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
        <div>
          <h1 className='text-2xl font-bold py-1'>Courses</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage courses
          </p>
        </div>
        <CourseFilters filters={filters} onFilterChange={updateFilters} />
        <CourseList
          courses={coursesData?.data || []}
          metadata={
            coursesData?.metadata || {
              total: 0,
              page: 1,
              limit: pageSize,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchCourses}
          paginationLoading={coursesLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
