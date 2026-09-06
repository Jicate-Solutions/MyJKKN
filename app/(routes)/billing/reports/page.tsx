'use client';

import { Suspense, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/hooks/use-tab-param';
import {
  BarChart3,
  FileText,
  TrendingUp,
  AlertCircle,
  ReceiptIndianRupee,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useBillingDashboardMetrics,
  useStudentYearBreakdown
} from '@/hooks/billing/use-billing-reports';
import { useCollectionSplit } from '@/hooks/billing/use-billing-analytics';
import { ReportFilters } from './_components/report-filters';
import type { BillingReportFilters } from '@/types/billing-schedule';
import { DashboardMetrics } from './_components/dashboard-metrics';
import { OutstandingReportTab } from './_components/outstanding-report-tab';
import { CollectionReportTab } from './_components/collection-report-tab';
import { InvoiceReportTab } from './_components/invoice-report-tab';
import { DiscountReportTab } from './_components/discount-report-tab';
import { RefundReportTab } from './_components/refund-report-tab';

const BILLING_REPORTS_TABS = [
  'dashboard',
  'outstanding',
  'collection',
  'invoices',
  'discounts',
  'refunds'
] as const;

function BillingReportsPageInner() {
  const [activeTab, setActiveTab] = useTabParam('dashboard', BILLING_REPORTS_TABS);
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
  } = useBillingDashboardMetrics(filters);

  // Year-wise split of the Total Students / amount cards. Separate query: the
  // dashboard RPC returns grand totals only.
  const { breakdown: yearWiseStudents } = useStudentYearBreakdown(filters);

  // Management vs Government split — served by the analytics RPC rather than
  // re-aggregated client-side here, since the attribution walks
  // receipt_items -> bills -> categories and belongs in Postgres.
  // Gated on billing.analytics.view inside the RPC, so a reports-only user
  // simply gets no split section (the query errors and `data` stays undefined).
  //
  // This RPC belongs to the separate billing analytics feature and its
  // filter type (BillingAnalyticsFilters) only accepts institution_ids and a
  // date range — no degree/department/program/scheme hierarchy. So unlike
  // useBillingDashboardMetrics above, it is deliberately left institution+date
  // scoped here rather than extended as a side effect of this change.
  const collectionSplit = useCollectionSplit({
    institution_ids: filters.institution_id ? [filters.institution_id] : undefined,
    date_from: filters.date_from,
    date_to: filters.date_to,
  });

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
          { label: 'Billing', href: '/billing' },
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
          <TabsList className='flex w-full justify-start gap-1 overflow-x-auto sm:grid sm:grid-cols-6 sm:gap-0 sm:overflow-visible'>
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
              <ReceiptIndianRupee className='h-4 w-4' />
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
                split={collectionSplit.data}
                yearWiseStudents={yearWiseStudents}
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

export default function BillingReportsPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <BillingReportsPageInner />
    </Suspense>
  );
}
