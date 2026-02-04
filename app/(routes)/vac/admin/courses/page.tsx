'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { VACCourseList } from './_components/vac-course-list';
import { VACCourseFiltersComponent } from './_components/vac-course-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import type { VACCourseFilters } from '@/types/vac';

export default function VACAdminCoursesPage() {
  const [filters, setFilters] = useState<VACCourseFilters>({
    activeOnly: false // Show all courses in admin
  });

  const { data, isLoading, error, refetch } = useVACCourses(filters);

  const updateFilters = (newFilters: Partial<VACCourseFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  if (error) {
    return (
      <ContentLayout title='VAC Courses'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            {error instanceof Error ? error.message : 'Failed to load courses'}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='VAC Courses'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Courses', href: '/vac/admin/courses' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>VAC Courses Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage Value-Added Courses for the institution
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/vac/admin/courses/new'>
                <Plus className='mr-2 h-4 w-4' />
                Add Course
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <VACCourseFiltersComponent
              filters={filters}
              onFilterChange={updateFilters}
            />

            {isLoading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <VACCourseList
                courses={data?.courses || []}
                onRefresh={() => refetch()}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
