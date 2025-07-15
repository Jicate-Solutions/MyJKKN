'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { CourseMappingList } from './_components/course-mapping-list';
import { CourseMappingFilters } from './_components/course-mapping-filters';

export default function CourseMappingsPage() {
  const {
    courseMappings,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchCourseMappings
  } = useCourseMappings({ page: 1, limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewCourseMappings =
    isSuperAdmin || canAccess('organizations.course_mappings', 'view');

  if (error) {
    console.error('[CourseMappingsPage] Render Error:', error);
    return (
      <ContentLayout title='Course Mappings'>
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
            <BreadcrumbPage>Mappings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Course Mappings</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage course mappings and prerequisites
          </p>
        </div>

        <CourseMappingFilters
          filters={filters}
          onFilterChange={updateFilters}
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
            canViewCourseMappings={canViewCourseMappings}
          />
        )}
      </div>
    </ContentLayout>
  );
}
