import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemestersDataTable } from './_components/semesters-data-table';
import { SemesterFiltersClient } from './_components/semester-filters-client';
import { semestersSearchParamsSchema } from './_components/data-table-schema';

interface SemestersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SemestersPage({ searchParams }: SemestersPageProps) {
  const params = await searchParams;
  const search = semestersSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Semesters'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Semesters' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Semesters</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic semesters
          </p>
        </div>

        <SemesterFiltersClient searchParams={search} />

        <SemestersDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
