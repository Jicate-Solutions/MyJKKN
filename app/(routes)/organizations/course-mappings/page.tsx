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
import { BeatLoader } from 'react-spinners';
import { useCourseMappings } from '@/hooks/organization/use-course-mappings';
import { CourseMappingFilters } from './_components/course-mapping-filters';
import { CourseMappingList } from './_components/course-mapping-list';

export default function CourseMappingsPage() {
  const {
    courseMappings,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchCourseMappings
  } = useCourseMappings();

  useEffect(() => {
    fetchCourseMappings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <ContentLayout title='Course Mappings'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchCourseMappings()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Course Mappings'>
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
            <BreadcrumbPage>Course Mappings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Course Mappings</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Map courses to institutions, degrees, departments, and semesters
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/organizations/course-mappings/new'>
                <Plus className='mr-2 h-4 w-4' />
                Map Course
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <CourseMappingFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <CourseMappingList
                courseMappings={courseMappings}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchCourseMappings}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
