'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgramsDataTable } from './_components/programs-data-table';
import { ProgramFiltersClient } from './_components/program-filters-client';
import { programsSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

interface ProgramsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ProgramsPage({ searchParams }: ProgramsPageProps) {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = programsSearchParamsSchema.parse(params);

  const pageTitle = adapt('Programs');
  const helpText = adapt('Manage academic programs');

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

        <ProgramFiltersClient searchParams={search} />

        <ProgramsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
