import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseMappingsDataTable } from './_components/course-mappings-data-table';
import { CourseMappingFiltersClient } from './_components/course-mapping-filters-client';
import { courseMappingsSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface CourseMappingsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CourseMappingsPage({ searchParams }: CourseMappingsPageProps) {
  // Note: useAdaptiveLabels is a client hook, so we can't use it directly in this async server component.
  // The labels will be adapted in the child components that are client-side.
  const params = await searchParams;
  const search = courseMappingsSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Course Mappings'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Courses', href: '/organizations/courses' },
          { label: 'Mappings' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <CourseMappingPageContent />


        <CourseMappingFiltersClient searchParams={search} />

        <CourseMappingsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}

// Client component for adaptive labels
function CourseMappingPageContent() {
  const adapt = useAdaptiveLabels();
  return (
    <div>
      <h1 className='text-2xl font-bold py-1'>{adapt('Course')} Mappings</h1>
      <p className='text-sm sm:text-base text-muted-foreground'>
        Manage {adapt('course').toLowerCase()} mappings and prerequisites
      </p>
    </div>
  );
}
