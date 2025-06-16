'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { useSemesters } from '@/hooks/organization/use-semesters';
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
import { SemesterList } from './_components/semester-list';
import { SemesterFilters } from './_components/semester-filters';

export default function SemestersPage() {
  const {
    semesters,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchSemesters
  } = useSemesters({ page: 1, limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'view');

  useEffect(() => {
    fetchSemesters();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Semesters'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSemesters()}
            className='mt-4'
            disabled={!canViewSemesters}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Semesters'>
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
            <BreadcrumbPage>Semesters</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Semesters</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic semesters
          </p>
        </div>

        <SemesterFilters
          filters={filters}
          onFilterChange={updateFilters}
        />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <SemesterList
            semesters={semesters}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchSemesters}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
