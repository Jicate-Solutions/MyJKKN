// app/(routes)/organizations/degrees/page.tsx

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useDegrees } from '@/hooks/use-degrees';
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
import { DegreeFilters } from './_components/degree-filters';
import { DegreeList } from './_components/degree-list';

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
              Manage degrees for institutions
            </p>
          </div>
          <Button className='w-full sm:w-auto' asChild>
            <Link href='/organizations/degrees/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Degree
            </Link>
          </Button>
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
