// app/(routes)/organizations/departments/page.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useDepartments } from '@/hooks/use-departments';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DepartmentFilter } from './_components/department-filters';
import { DepartmentList } from './_components/department-list';

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

      <div className='space-y-6'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-3xl font-bold'>Departments</h1>
            <p className='text-muted-foreground'>
              Manage departments across all institutions
            </p>
          </div>
          <Button asChild>
            <Link href='/organizations/departments/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Department
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentFilter
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
