import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CoursesDataTable } from './_components/courses-data-table';
import { CourseFiltersClient } from './_components/course-filters-client';
import { coursesSearchParamsSchema } from './_components/data-table-schema';

interface CoursesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const params = await searchParams;
  const search = coursesSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Courses'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Courses' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Courses</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic courses
          </p>
        </div>

        <CourseFiltersClient searchParams={search} />

        <CoursesDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
