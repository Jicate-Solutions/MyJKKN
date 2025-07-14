'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { CourseList } from './_components/course-list';
import { useCourses } from '@/hooks/organization/use-courses';
import { CourseFilters } from './_components/course-filters';

export default function CoursesPage() {
  const {
    courses,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchCourses
  } = useCourses({ page: 1, limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');

  if (error) {
    console.error('[CoursesPage] Render Error:', error);
    return (
      <ContentLayout title='Courses'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => window.location.reload()}
            className='mt-4'
          >
            Refresh Page
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Courses'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Courses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Courses</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic courses
          </p>
        </div>

        <CourseFilters filters={filters} onFilterChange={updateFilters} />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <CourseList
            courses={courses}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchCourses}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
