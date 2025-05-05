// app/(routes)/organizations/degrees/page.tsx

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
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
import { DegreeFilters } from './_components/degree-filters';
import { DegreeList } from './_components/degree-list';
import DownloadDegreeTemplateButton from './_components/download-degree-template';
import BulkUploadDegrees from './_components/bulk-upload-degrees';
import ExportDegrees from './_components/export-degrees';
import { useDegrees } from '@/hooks/organization/use-degrees';

export default function DegreesPage() {
  const {
    degrees,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDegrees
  } = useDegrees();

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'view');
  const canCreateDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'create');
  const canEditDegrees =
    isSuperAdmin || canAccess('organizations.degrees', 'edit');

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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Degrees</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage your educational degrees
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {isSuperAdmin && <DownloadDegreeTemplateButton />}
            {isSuperAdmin && <ExportDegrees />}
            {isSuperAdmin && <BulkUploadDegrees />}
            {canCreateDegrees ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/organizations/degrees/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Degree
                </Link>
              </Button>
            ) : (
              <Button
                disabled
                variant='outline'
                className='w-full sm:w-auto opacity-50'
              >
                <Plus className='mr-2 h-4 w-4' />
                Add Degree
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DegreeFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <DegreeList
                degrees={degrees}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchDegrees}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
