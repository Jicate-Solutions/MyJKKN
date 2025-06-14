'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { SemesterList } from './_components/semester-list';
import { SemesterFilters } from './_components/semester-filters';
import { SemesterFilters as SemesterFiltersType } from '@/types/organizations';

export default function SemestersPage() {
  const {
    semesters,
    loading,
    paginationLoading,
    error,
    metadata,
    changePage,
    changePageSize,
    fetchSemesters
  } = useSemesters();

  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<SemesterFiltersType>({
    page: 1,
    limit: 10
  });
  const canViewSemesters =
    isSuperAdmin || canAccess('organizations.semesters', 'view');

  useEffect(() => {
    // Only fetch semesters if user has permission
    if (canViewSemesters) {
      fetchSemesters();
    }
  }, [fetchSemesters, canViewSemesters]);

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
        <SemesterFilters filters={filters} onFilterChange={setFilters} />
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
