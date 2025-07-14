'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { useSections } from '@/hooks/organization/use-sections';
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
import { SectionList } from './_components/section-list';
import { SectionFilters } from './_components/section-filters';

export default function SectionsPage() {
  const {
    sections,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchSections
  } = useSections({ page: 1, limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');
  const canCreateSections =
    isSuperAdmin || canAccess('organizations.sections', 'create');

  if (error) {
    console.error('[SectionsPage] Render Error:', error);
    return (
      <ContentLayout title='Sections'>
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
    <ContentLayout title='Sections'>
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
            <BreadcrumbPage>Sections</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Sections</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic sections
          </p>
        </div>

        <SectionFilters filters={filters} onFilterChange={updateFilters} />

        {loading ? (
          <div className='flex justify-center items-center p-8'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <SectionList
            sections={sections}
            metadata={metadata}
            onPageChange={changePage}
            onPageSizeChange={changePageSize}
            onRefresh={fetchSections}
            paginationLoading={paginationLoading}
          />
        )}
      </div>
    </ContentLayout>
  );
}
