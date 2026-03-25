// app/(routes)/organizations/institutions/page.tsx

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InstitutionsDataTable } from './_components/institutions-data-table';
import { InstitutionFiltersClient } from './_components/institution-filters-client';
import { institutionsSearchParamsSchema } from './_components/data-table-schema';

interface InstitutionsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InstitutionsPage({ searchParams }: InstitutionsPageProps) {
  const params = await searchParams;
  const search = institutionsSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Institutions'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Institutions' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Institutions</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage institutions and their details
          </p>
        </div>

        <InstitutionFiltersClient searchParams={search} />

        <InstitutionsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
