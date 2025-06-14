'use client';

import { useEffect, useState } from 'react';
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
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { CourseMappingList } from './_components/course-mapping-list';
import { CourseMappingFilters } from './_components/course-mapping-filters';
import { CourseMappingFilters as CourseMappingFiltersType } from '@/types/organizations';

export default function CourseMappingsPage() {
  const {
    courseMappings,
    loading,
    paginationLoading,
    error,
    metadata,
    changePage,
    changePageSize,
    fetchCourseMappings
  } = useCourseMappings();

  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<CourseMappingFiltersType>({
    page: 1,
    limit: 10
  });
  const canViewCourseMappings =
    isSuperAdmin || canAccess('organizations.course.mappings', 'view');

  useEffect(() => {
    // Only fetch course mappings if user has permission
    if (canViewCourseMappings) {
      fetchCourseMappings();
    }
  }, [fetchCourseMappings, canViewCourseMappings]);

  if (error) {
    return (
      <ContentLayout title='Course Mappings'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCourseMappings()}
            className='mt-4'
            disabled={!canViewCourseMappings}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Course Mappings'>
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
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses'>Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Course Mappings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Course Mappings</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Map courses to institutions, degrees, departments, and semesters
            </p>
          </div>
        </div>
        <CourseMappingFilters
          filters={filters}
          onFilterChange={setFilters}
        />
        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <CourseMappingList
            courseMappings={courseMappings}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchCourseMappings}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
