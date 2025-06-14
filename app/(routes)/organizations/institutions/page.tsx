// app/(routes)/organizations/institutions/page.tsx
'use client';

import { useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useInstitutions } from '@/hooks/organization/use-institutions';
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
import { InstitutionList } from './_components/institution-list';
import Link from 'next/link';
import { InstitutionFilter } from './_components/institution-filters';

export default function InstitutionsPage() {
  const {
    institutions,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchInstitutions
  } = useInstitutions();

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'view');

  useEffect(() => {
    fetchInstitutions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Institutions'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchInstitutions()}
            className='mt-4'
            disabled={!canViewInstitutions}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Institutions'>
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
            <BreadcrumbPage>Institutions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Institutions</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage your educational institutions
          </p>
        </div>

        <InstitutionFilter filters={filters} onFilterChange={updateFilters} />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <InstitutionList
            institutions={institutions}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchInstitutions}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
