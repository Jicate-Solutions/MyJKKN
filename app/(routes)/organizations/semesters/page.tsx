'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SemestersDataTable } from './_components/semesters-data-table';
import { SemesterFiltersClient } from './_components/semester-filters-client';
import { semestersSearchParamsSchema } from './_components/data-table-schema';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useSearchParams } from 'next/navigation';

interface SemestersPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function SemestersPage({ searchParams }: SemestersPageProps) {
  const adapt = useAdaptiveLabels();
  const rawSearchParams = useSearchParams();

  // Convert URLSearchParams to object for schema parsing
  const params = Object.fromEntries(rawSearchParams.entries());
  const search = semestersSearchParamsSchema.parse(params);

  const pageTitle = adapt('Semesters');
  const helpText = adapt('Manage academic semesters');

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

        <SemesterFiltersClient searchParams={search} />

        <SemestersDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
