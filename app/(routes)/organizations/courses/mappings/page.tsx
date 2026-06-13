'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseMappingsDataTable } from './_components/course-mappings-data-table';
import { CourseMappingFiltersClient } from './_components/course-mapping-filters-client';
import { courseMappingsSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

export default function CourseMappingsPage() {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = courseMappingsSearchParamsSchema.parse(params);

  const courseLabel = adapt('Course');

  return (
    <ContentLayout title={`${courseLabel} Mappings`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Courses', href: '/organizations/courses' },
          { label: 'Mappings' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{courseLabel} Mappings</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage {adapt('course').toLowerCase()} mappings and prerequisites
          </p>
        </div>

        <CourseMappingFiltersClient searchParams={search} />

        <CourseMappingsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
