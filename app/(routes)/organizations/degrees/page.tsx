// app/(routes)/organizations/degrees/page.tsx

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DegreesDataTable } from './_components/degrees-data-table';
import { DegreesFiltersClient } from './_components/degrees-filters-client';
import { degreesSearchParamsSchema } from './_components/data-table-schema';

interface DegreesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DegreesPage({ searchParams }: DegreesPageProps) {
  const params = await searchParams;
  const search = degreesSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Degrees'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Degrees' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Degrees</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic degrees
          </p>
        </div>

        <DegreesFiltersClient searchParams={search} />

        <DegreesDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
