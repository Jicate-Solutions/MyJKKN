import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CourseMappingsDataTable } from './_components/course-mappings-data-table';
import { CourseMappingFiltersClient } from './_components/course-mapping-filters-client';
import { courseMappingsSearchParamsSchema } from './_components/data-table-schema';

interface CourseMappingsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CourseMappingsPage({ searchParams }: CourseMappingsPageProps) {
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
        <div>
          <h1 className='text-2xl font-bold py-1'>Course Mappings</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage course mappings and prerequisites
          </p>
        </div>

        <CourseMappingFiltersClient searchParams={search} />

        <CourseMappingsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
