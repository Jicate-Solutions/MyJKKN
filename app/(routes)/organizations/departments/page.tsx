// app/(routes)/organizations/departments/page.tsx

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useDepartments } from '@/hooks/organization/use-departments';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { DepartmentFilters } from './_components/department-filters';
import { DepartmentList } from './_components/department-list';
import DownloadDepartmentTemplateButton from './_components/download-department-template';
import BulkUploadDepartments from './_components/bulk-upload-departments';

export default function DepartmentsPage() {
  const {
    departments,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDepartments
  } = useDepartments();

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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Departments</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage departments for institutions
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <DownloadDepartmentTemplateButton />
            <BulkUploadDepartments />
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/organizations/departments/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Department
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentFilters
              filters={filters}
              onFilterChange={updateFilters}
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
                onRefresh={fetchDepartments}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
