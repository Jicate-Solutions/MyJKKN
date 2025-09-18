'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Settings2, Filter } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { BillingScheduleDataTable } from './_components/billing-schedule-data-table';
import { billingScheduleSearchParamsSchema } from './_components/data-table-schema';
import { BillingScheduleFilters } from './_components/billing-schedule-filters';
import { AdvancedBillingScheduleFilters } from './_components/advanced-billing-schedule-filters';

export default function BillingSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [useAdvancedFilters, setUseAdvancedFilters] = useState(false);

  // Parse current search parameters
  const search = billingScheduleSearchParamsSchema.parse(
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

      router.push(`/billing/schedule?${params.toString()}`);
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
    router.push(`/billing/schedule?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <PermissionGuard module='billing.schedule' action='view'>
      <ContentLayout title='Billing Schedule'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/billing'>Billing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Schedule</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header Section */}
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Billing Schedule Management</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Manage student bills, track payments, and schedule recurring billing
              </p>
            </div>

            <Button
              variant={useAdvancedFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setUseAdvancedFilters(!useAdvancedFilters)}
              className="flex items-center gap-2"
            >
              {useAdvancedFilters ? (
                <>
                  <Settings2 className="h-4 w-4" />
                  Advanced Filters
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4" />
                  Basic Filters
                </>
              )}
            </Button>
          </div>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Filters */}
                {useAdvancedFilters ? (
                  <AdvancedBillingScheduleFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                ) : (
                  <BillingScheduleFilters
                    searchParams={search}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                  />
                )}

                {/* Data Table */}
                <BillingScheduleDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}