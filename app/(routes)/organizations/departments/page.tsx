// app/(routes)/organizations/departments/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { useDepartments } from '@/hooks/organization/use-departments';
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
import { DepartmentList } from './_components/department-list';
import { DepartmentFilters } from './_components/department-filters';
import { DepartmentFilters as DepartmentFiltersType } from '@/types/organizations';

export default function DepartmentsPage() {
  const {
    departments,
    loading,
    paginationLoading,
    error,
    metadata,
    changePage,
    changePageSize,
    fetchDepartments
  } = useDepartments();

  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<DepartmentFiltersType>({
    page: 1,
    limit: 10
  });
  const canViewDepartments =
    isSuperAdmin || canAccess('organizations.departments', 'view');

  useEffect(() => {
    fetchDepartments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Departments'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchDepartments()}
            className='mt-4'
            disabled={!canViewDepartments}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Departments'>
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
            <BreadcrumbPage>Departments</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Departments</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage departments for institutions
          </p>
        </div>

        <DepartmentFilters
          filters={filters}
          onFilterChange={setFilters}
        />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <DepartmentList
            departments={departments}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchDepartments}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
