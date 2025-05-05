'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useSections } from '@/hooks/organization/use-sections';
import { Card, CardContent } from '@/components/ui/card';
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
import { SectionFilters } from './_components/section-filters';
import { SectionList } from './_components/section-list';
import DownloadSectionTemplateButton from './_components/download-section-template';
import BulkUploadSections from './_components/bulk-upload-sections';
import { ExportSections } from './_components/export-sections';

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
  } = useSections();

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');
  const canCreateSections =
    isSuperAdmin || canAccess('organizations.sections', 'create');
  const canEditSections =
    isSuperAdmin || canAccess('organizations.sections', 'edit');
  const canDeleteSections =
    isSuperAdmin || canAccess('organizations.sections', 'delete');

  useEffect(() => {
    // Only fetch sections if user has permission
    if (canViewSections) {
      fetchSections();
    }
  }, [fetchSections, canViewSections]);

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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Sections</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage class sections
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {isSuperAdmin && <DownloadSectionTemplateButton />}
            {isSuperAdmin && <ExportSections />}
            {isSuperAdmin && <BulkUploadSections />}
            {canCreateSections ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/organizations/sections/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Section
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Section
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
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
                onRefresh={fetchSections}
                canEdit={canEditSections}
                canDelete={canDeleteSections}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
