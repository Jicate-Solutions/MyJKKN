'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CoursesDataTable } from './_components/courses-data-table';
import { CourseFiltersClient } from './_components/course-filters-client';
import { coursesSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

interface CoursesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function CoursesPage({ searchParams }: CoursesPageProps) {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = coursesSearchParamsSchema.parse(params);

  const pageTitle = adapt('Courses');
  const helpText = adapt('Manage academic courses');

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: pageTitle }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            {helpText}
          </p>
        </div>

        <CourseFiltersClient searchParams={search} />

        <CoursesDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
