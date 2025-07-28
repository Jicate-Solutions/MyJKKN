// app/(routes)/organizations/institutions/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InstitutionsDataTable } from './_components/institutions-data-table';
import { InstitutionFilter } from './_components/institution-filters';
import { institutionsSearchParamsSchema } from './_components/data-table-schema';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export default function InstitutionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = institutionsSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/organizations/institutions?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/organizations/institutions?${params.toString()}`);
  }, [router, searchParams]);

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

        <InstitutionFilter
          searchParams={search}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />

        <InstitutionsDataTable search={search} />
      </div>
    </ContentLayout>
  );
}
