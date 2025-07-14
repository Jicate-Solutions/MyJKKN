'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePrograms } from '@/hooks/organization/use-programs';
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
import { ProgramList } from './_components/program-list';
import { ProgramFilters } from './_components/program-filters';

export default function ProgramsPage() {
  const {
    programs,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchPrograms
  } = usePrograms({ page: 1, limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewPrograms =
    isSuperAdmin || canAccess('organizations.programs', 'view');

  if (error) {
    console.error('[ProgramsPage] Render Error:', error);
    return (
      <ContentLayout title='Programs'>
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
    <ContentLayout title='Programs'>
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
            <BreadcrumbPage>Programs</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Programs</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic programs
          </p>
        </div>

        <ProgramFilters filters={filters} onFilterChange={updateFilters} />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <ProgramList
            programs={programs}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchPrograms}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
