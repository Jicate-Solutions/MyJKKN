// app/(routes)/organizations/departments/page.tsx

'use client';

import { useState } from 'react';
import { useDepartments } from '@/hooks/organization/use-departments';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DepartmentList } from './_components/department-list';
import { DepartmentFilters } from './_components/department-filters';
import { DepartmentFilters as DepartmentFilterType } from '@/types/organizations';

export default function DepartmentsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Partial<DepartmentFilterType>>({
    isActive: true
  });

  const {
    data: departmentsData,
    isLoading: departmentsLoading,
    error: departmentsError,
    refetch: refetchDepartments
  } = useDepartments({
    page,
    limit: pageSize,
    search: searchQuery,
    ...filters
  });

  const handleFilterChange = (newFilters: Partial<DepartmentFilterType>) => {
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

  if (departmentsError) {
    return (
      <ContentLayout title='Departments'>
        <div className='text-center py-8 text-destructive'>
          {departmentsError.message}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Departments'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Departments' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Departments</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage departments and their details
          </p>
        </div>
        <DepartmentFilters
          onFilterChange={handleFilterChange}
          filters={filters}
        />
        <DepartmentList
          departments={departmentsData?.data || []}
          metadata={
            departmentsData?.metadata || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 1
            }
          }
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRefresh={refetchDepartments}
          paginationLoading={departmentsLoading}
          onSearch={handleSearch}
        />
      </div>
    </ContentLayout>
  );
}
