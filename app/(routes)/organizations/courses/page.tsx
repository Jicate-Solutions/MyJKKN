'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { CourseFilters } from './_components/course-filters';
import { CourseList } from './_components/course-list';
import DownloadCourseTemplateButton from './_components/download-course-template';
import BulkUploadCourses from './_components/bulk-upload-courses';
import { useCourses } from '@/hooks/organization/use-courses';
import { ExportCourses } from './_components/export-courses';

export default function CoursesPage() {
  const {
    courses,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCourses
  } = useCourses();

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');
  const canCreateCourses =
    isSuperAdmin || canAccess('organizations.courses', 'create');
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

  useEffect(() => {
    // Only fetch courses if user has permission
    if (canViewCourses) {
      fetchCourses();
    }
  }, [fetchCourses, canViewCourses]);

  if (error) {
    return (
      <ContentLayout title='Courses'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCourses()}
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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Courses</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic courses
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {isSuperAdmin && <DownloadCourseTemplateButton />}
            {isSuperAdmin && <ExportCourses />}
            {isSuperAdmin && <BulkUploadCourses />}
            {canCreateCourses ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/organizations/courses/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Course
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Course
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
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
                onRefresh={fetchCourses}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
