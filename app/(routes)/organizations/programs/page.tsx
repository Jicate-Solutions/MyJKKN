'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePrograms } from '@/hooks/organization/use-programs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';

import { ProgramFilters } from './_components/program-filters';
import { ProgramList } from './_components/program-list';
import DownloadProgramTemplateButton from './_components/download-program-template';
import BulkUploadPrograms from './_components/bulk-upload-programs';
import { ExportPrograms } from './_components/export-programs';

export default function ProgramsPage() {
  const {
    programs,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPrograms
  } = usePrograms();

  useEffect(() => {
    fetchPrograms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Programs'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchPrograms()}
            className='mt-4'
          >
            Try Again
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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Programs</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic programs
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <DownloadProgramTemplateButton />
            <ExportPrograms />
            <BulkUploadPrograms />
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/organizations/programs/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Program
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
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
                onRefresh={fetchPrograms}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
