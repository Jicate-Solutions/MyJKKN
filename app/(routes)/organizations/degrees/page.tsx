// app/(routes)/organizations/degrees/page.tsx

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
import { DegreeList } from './_components/degree-list';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { DegreeFilters } from './_components/degree-filters';
import { DegreeFilters as DegreeFiltersType } from '@/types/organizations';

export default function DegreesPage() {
  const {
    degrees,
    loading,
    paginationLoading,
    error,
    metadata,
    changePage,
    changePageSize,
    fetchDegrees
  } = useDegrees();

  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<DegreeFiltersType>({
    page: 1,
    limit: 10
  });

  const canViewDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'view');

  useEffect(() => {
    fetchDegrees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Degrees'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchDegrees()}
            className='mt-4'
            disabled={!canViewDegrees}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Degrees'>
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
            <BreadcrumbPage>Degrees</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Degrees</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage your educational degrees
          </p>
        </div>

        <DegreeFilters filters={filters} onFilterChange={setFilters} />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <DegreeList
            degrees={degrees}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchDegrees}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
