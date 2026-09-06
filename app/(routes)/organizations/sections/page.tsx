'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SectionsDataTable } from './_components/sections-data-table';
import { SectionFiltersClient } from './_components/section-filters-client';
import { sectionsSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

export default function SectionsPage() {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = sectionsSearchParamsSchema.parse(params);

  const pageTitle = adapt('Sections');
  const helpText = adapt('Manage academic sections');

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

        <SectionFiltersClient searchParams={search} />

        <SectionsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
