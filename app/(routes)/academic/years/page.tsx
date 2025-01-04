// app/(routes)/academic/years/page.tsx

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
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
import { AcademicYearFilters } from './_components/academic-year-filters';
import { AcademicYearList } from './_components/academic-year-list';

export default function AcademicYearsPage() {
  const {
    academicYears,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchAcademicYears
  } = useAcademicYears();

  useEffect(() => {
    fetchAcademicYears();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Academic Years'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchAcademicYears()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Academic Years'>
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
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Academic Years</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Academic Years</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage academic years for your institutions
            </p>
          </div>
          <Button className='w-full sm:w-auto' asChild>
            <Link href='/academic/years/new'>
              <Plus className='mr-2 h-4 w-4' />
              Add Academic Year
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AcademicYearFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <AcademicYearList
                academicYears={academicYears}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchAcademicYears}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
