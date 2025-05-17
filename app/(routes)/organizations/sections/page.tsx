'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useSections } from '@/hooks/organization/use-sections';
import Loading from '@/components/Loading/Loading';
import { usePermissions } from '@/hooks/use-permissions';
import { PaginationWithControls } from '@/components/ui/pagination';
import { SectionFilters } from './_components/section-filters';
import { SectionEmptyState } from './_components/section-empty-state';
import { SectionList } from './_components/section-list';

export default function SectionsPage() {
  const {
    sections,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSections
  } = useSections({ limit: 10 });

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewSections =
    isSuperAdmin || canAccess('organization.sections', 'view');
  const canCreateSections =
    isSuperAdmin || canAccess('organization.sections', 'create');
  const canEditSections =
    isSuperAdmin || canAccess('organization.sections', 'edit');
  const canDeleteSections =
    isSuperAdmin || canAccess('organization.sections', 'delete');

  useEffect(() => {
    fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewSections) {
    return <Loading title='Loading sections...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Sections'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSections()}
            className='mt-4'
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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Sections</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage sections in your organization
            </p>
          </div>
          {canCreateSections ? (
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/organizations/sections/new'>
                <Plus className='mr-2 h-4 w-4' />
                Create Section
              </Link>
            </Button>
          ) : (
            <Button
              className='w-full sm:w-auto opacity-50'
              disabled
              variant='outline'
            >
              <Plus className='mr-2 h-4 w-4' />
              Create Section
            </Button>
          )}
        </div>

        <Card>
          <CardContent className='p-6'>
            <SectionFilters filters={filters} onFilterChange={updateFilters} />

            {loading && <Loading title='Loading sections...' />}

            {!loading && !error && sections.length === 0 && (
              <SectionEmptyState canCreate={canCreateSections} />
            )}

            {!loading && !error && sections.length > 0 && (
              <>
                <SectionList
                  sections={sections}
                  canView={canViewSections}
                  canEdit={canEditSections}
                  canDelete={canDeleteSections}
                  onRefresh={fetchSections}
                />
                <PaginationWithControls
                  currentPage={metadata.page}
                  totalPages={metadata.totalPages}
                  onPageChange={changePage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
