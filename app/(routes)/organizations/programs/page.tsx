import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramsDataTable } from './_components/programs-data-table';
import { ProgramFiltersClient } from './_components/program-filters-client';
import { programsSearchParamsSchema } from './_components/data-table-schema';

interface ProgramsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProgramsPage({ searchParams }: ProgramsPageProps) {
  const params = await searchParams;
  const search = programsSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Programs'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Programs' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Programs</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic programs
          </p>
        </div>

        <ProgramFiltersClient searchParams={search} />

        <ProgramsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
