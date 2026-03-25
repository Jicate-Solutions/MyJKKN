'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  FileText,
  TrendingUp,
  AlertCircle,
  Receipt,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBillingDashboardMetrics } from '@/hooks/billing/use-billing-reports';
import { ReportFilters } from './_components/report-filters';
import type { BillingReportFilters } from '@/types/billing-schedule';
import { DashboardMetrics } from './_components/dashboard-metrics';
import { OutstandingReportTab } from './_components/outstanding-report-tab';
import { CollectionReportTab } from './_components/collection-report-tab';
import { InvoiceReportTab } from './_components/invoice-report-tab';
import { DiscountReportTab } from './_components/discount-report-tab';
import { RefundReportTab } from './_components/refund-report-tab';

export default function BillingReportsPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [filters, setFilters] = useState<BillingReportFilters>({});

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewReports = isSuperAdmin || canAccess('billing.reports', 'view');
  const canExportReports =
    isSuperAdmin || canAccess('billing.reports', 'export');

  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics
  } = useBillingDashboardMetrics(
    filters.institution_id,
    filters.date_from,
    filters.date_to
  );

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Reports'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewReports) {
    return (
      <ContentLayout title='Billing Reports'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing reports.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleFilterChange = (newFilters: Partial<BillingReportFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  return (
    <ContentLayout title='Billing Reports'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Reports', href: '/billing/reports' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Reports</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Comprehensive billing analytics and financial reporting
            </p>
          </div>
          <Button
            variant='outline'
            onClick={refetchMetrics}
            disabled={metricsLoading}
            className='w-full sm:w-auto'
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${metricsLoading ? 'animate-spin' : ''}`}
            />
            Refresh Data
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='p-6'>
            <ReportFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </CardContent>
        </Card>

        {/* Reports Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='space-y-4'
        >
          <TabsList className='grid w-full grid-cols-6'>
            <TabsTrigger value='dashboard' className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4' />
              Dashboard
            </TabsTrigger>
            <TabsTrigger
              value='outstanding'
              className='flex items-center gap-2'
            >
              <AlertCircle className='h-4 w-4' />
              Outstanding
            </TabsTrigger>
            <TabsTrigger value='collection' className='flex items-center gap-2'>
              <TrendingUp className='h-4 w-4' />
              Collection
            </TabsTrigger>
            <TabsTrigger value='invoices' className='flex items-center gap-2'>
              <FileText className='h-4 w-4' />
              Invoices
            </TabsTrigger>
            <TabsTrigger value='discounts' className='flex items-center gap-2'>
              <Receipt className='h-4 w-4' />
              Discounts
            </TabsTrigger>
            <TabsTrigger value='refunds' className='flex items-center gap-2'>
              <CreditCard className='h-4 w-4' />
              Refunds
            </TabsTrigger>
          </TabsList>

          <TabsContent value='dashboard'>
            {metricsError ? (
              <Card>
                <CardContent className='flex flex-col items-center justify-center py-16'>
                  <AlertCircle className='h-12 w-12 text-destructive mb-4' />
                  <h3 className='text-lg font-semibold mb-2'>
                    Error Loading Dashboard
                  </h3>
                  <p className='text-muted-foreground text-center max-w-md mb-4'>
                    {metricsError}
                  </p>
                  <Button variant='outline' onClick={refetchMetrics}>
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <DashboardMetrics
                metrics={metrics}
                loading={metricsLoading}
                canExport={canExportReports}
              />
            )}
          </TabsContent>

          <TabsContent value='outstanding'>
            <OutstandingReportTab
              filters={filters}
              canExport={canExportReports}
            />
          </TabsContent>

          <TabsContent value='collection'>
            <CollectionReportTab
              filters={filters}
              canExport={canExportReports}
            />
          </TabsContent>

          <TabsContent value='invoices'>
            <InvoiceReportTab filters={filters} canExport={canExportReports} />
          </TabsContent>

          <TabsContent value='discounts'>
            <DiscountReportTab filters={filters} canExport={canExportReports} />
          </TabsContent>

          <TabsContent value='refunds'>
            <RefundReportTab filters={filters} canExport={canExportReports} />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
