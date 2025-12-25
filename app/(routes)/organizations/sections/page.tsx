import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SectionsDataTable } from './_components/sections-data-table';
import { SectionFiltersClient } from './_components/section-filters-client';
import { sectionsSearchParamsSchema } from './_components/data-table-schema';

interface SectionsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SectionsPage({ searchParams }: SectionsPageProps) {
  const params = await searchParams;
  const search = sectionsSearchParamsSchema.parse(params);

  return (
    <ContentLayout title='Sections'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: 'Sections' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Sections</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Manage academic sections
          </p>
        </div>

        <SectionFiltersClient searchParams={search} />

        <SectionsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
