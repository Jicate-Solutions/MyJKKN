'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useSemesters } from '@/hooks/use-semesters';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { SemesterFilters } from './_components/semester-filters';
import { SemesterList } from './_components/semester-list';

export default function SemestersPage() {
  const {
    semesters,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSemesters
  } = useSemesters();

  useEffect(() => {
    fetchSemesters();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Semesters'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchSemesters()}
            className='mt-4'
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
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Semesters</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic semesters
            </p>
          </div>
          <Button className='w-full sm:w-auto' asChild>
            <Link href='/organizations/semesters/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Semester
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SemesterFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <SemesterList
                semesters={semesters}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchSemesters}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
