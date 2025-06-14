'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useSections } from '@/hooks/organization/use-sections';
import { usePermissions } from '@/hooks/use-permissions';
import { SectionList } from './_components/section-list';
import { BeatLoader } from 'react-spinners';
import { SectionFilters } from './_components/section-filters';
import { SectionFilters as SectionFiltersType } from '@/types/organizations';

export default function SectionsPage() {
  const {
    sections,
    loading,
    paginationLoading,
    error,
    metadata,
    changePage,
    changePageSize,
    fetchSections
  } = useSections({ limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<SectionFiltersType>({
    page: 1,
    limit: 10
  });
  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');

  useEffect(() => {
    fetchSections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Sections'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSections()}
            className='mt-4'
            disabled={!canViewSections}
          >
            Try Again
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
            Manage sections in your organization
          </p>
        </div>
        <SectionFilters
          filters={filters}
          onFilterChange={setFilters}
        />
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
