'use client';

import { useState } from 'react';
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseMappingList } from './_components/course-mapping-list';
import { CourseMappingFilters } from './_components/course-mapping-filters';
import BulkUploadCourseMappings from './_components/bulk-upload-course-mappings';
import DownloadCourseMappingTemplateButton from './_components/download-course-mapping-template';
import { CourseMappingFilters as CourseMappingFilterType } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';

export default function CourseMappingsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<CourseMappingFilterType>>({});

  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');

  const {
    data: courseMappingsData,
    isLoading: courseMappingsLoading,
    error: courseMappingsError,
    refetch: refetchCourseMappings
  } = useCourseMappings({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<CourseMappingFilterType>) => {
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

        <CourseMappingList
          courseMappings={courseMappingsData?.data || []}
          metadata={
            courseMappingsData?.metadata || {
              total: 0,
              page: 1,
              limit: pageSize,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchCourseMappings}
          paginationLoading={courseMappingsLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
