'use client';

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBillingActivityMetrics,
  billingActivityKeys
} from '@/hooks/billing/use-billing-activities';
import { BillingActivityMetricsCards } from './_components/billing-activity-metrics';
import {
  BillingActivityFilters,
  DEFAULT_FILTERS,
  type BillingActivityFilterValues
} from './_components/billing-activity-filters';
import { BillingActivityDataTable } from './_components/billing-activity-data-table';

export default function BillingActivitiesPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<BillingActivityFilterValues>(DEFAULT_FILTERS);

  const dateRange = useMemo(() => {
    if (filters.date_from && filters.date_to) {
      return {
        from: `${filters.date_from}T00:00:00Z`,
        to: `${filters.date_to}T23:59:59Z`
      };
    }
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    return {
      from: thirtyDaysAgo.toISOString(),
      to: now.toISOString()
    };
  }, [filters.date_from, filters.date_to]);

  const {
    data: metrics,
    isLoading: metricsLoading,
    isFetching
  } = useBillingActivityMetrics(dateRange);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: billingActivityKeys.all });
  };

  return (
    <PermissionGuard module='billing.activities' action='view'>
      <ContentLayout title='Billing Activities'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing' },
            { label: 'Activities' }
          ]}
        />

        <div className='space-y-6 mt-4'>
          {/* Header */}
          <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Billing Activities</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Audit trail of all billing operations — bills, receipts,
                invoices, discounts, and refunds
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          </div>

          {/* Metrics Cards */}
          <BillingActivityMetricsCards
            metrics={metrics}
            isLoading={metricsLoading}
          />

          {/* Filters + Table */}
          <Card>
            <CardContent className='p-6 space-y-6'>
              <BillingActivityFilters
                value={filters}
                onChange={setFilters}
              />

              <BillingActivityDataTable filters={filters} />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
