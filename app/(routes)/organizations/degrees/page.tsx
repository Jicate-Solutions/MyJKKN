'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DegreesDataTable } from './_components/degrees-data-table';
import { DegreesFiltersClient } from './_components/degrees-filters-client';
import { StreamsMobileNav } from './_components/streams-mobile-nav';
import { degreesSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

interface DegreesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function DegreesPage({ searchParams }: DegreesPageProps) {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = degreesSearchParamsSchema.parse(params);

  const pageTitle = adapt('Degrees');
  const helpText = adapt('Manage academic degrees');

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Organizations' },
          { label: pageTitle }
        ]}
      />
      <div className='space-y-6 mt-4 pb-20 md:pb-6'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            {helpText}
          </p>
        </div>

        <div id='streams-filters'>
          <DegreesFiltersClient searchParams={search} />
        </div>

        <DegreesDataTable search={search} />
      </div>

      <StreamsMobileNav />
    </ContentLayout>
  );
}
