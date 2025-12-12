'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { BatchesDataTable } from './_components/batch-data-table';
import { batchesSearchParamsSchema } from './_components/data-table-schema';
import { BatchFilters } from './_components/batch-filters';

export default function BatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse current search parameters
  const search = batchesSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/academic/batches?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep only page and pageSize
    params.set('page', '1');
    if (searchParams.get('pageSize')) {
      params.set('pageSize', searchParams.get('pageSize')!);
    }
    router.push(`/academic/batches?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='academic.batches' action='view'>
      <ContentLayout title='Academic Batches'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Batches</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                <BatchFilters
                  searchParams={search}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />

                {/* Data Table */}
                <BatchesDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
