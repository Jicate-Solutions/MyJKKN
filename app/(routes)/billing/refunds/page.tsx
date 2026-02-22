/**
 * Billing Refunds List Page - Server Component
 *
 * Server-rendered page with cached data fetching.
 * Uses URL search params for filtering instead of client state.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, CreditCard, TrendingUp, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TableSkeleton } from '@/components/Loading';
import { getRefunds } from './_data/get-refunds';
import { RefundsTableServer } from './_components/refunds-table-server';
import { RefundsFiltersClient } from './_components/refunds-filters-client';
import { RefundsPaginationClient } from './_components/refunds-pagination-client';

interface SearchParams {
  page?: string;
  limit?: string;
  search?: string;
  institution_id?: string;
  student_id?: string;
  receipt_id?: string;
  approval_status?: string;
  refund_category?: string;
  refund_method?: string;
  refund_date_from?: string;
  refund_date_to?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface BillingRefundsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function BillingRefundsPage({
  searchParams
}: BillingRefundsPageProps) {
  const params = await searchParams;

  // Build filters from URL params
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    limit: params.limit ? parseInt(params.limit) : 10,
    search: params.search,
    institution_id: params.institution_id,
    student_id: params.student_id,
    receipt_id: params.receipt_id,
    approval_status: params.approval_status,
    refund_category: params.refund_category,
    refund_method: params.refund_method,
    refund_date_from: params.refund_date_from,
    refund_date_to: params.refund_date_to,
    sortBy: params.sortBy || 'refund_date',
    sortDirection: (params.sortDirection as 'asc' | 'desc') || 'desc'
  };

  // Fetch data server-side with caching
  let refunds: Awaited<ReturnType<typeof getRefunds>>['data'] = [];
  let metadata: Awaited<ReturnType<typeof getRefunds>>['metadata'] = {
    page: 1,
    totalPages: 0,
    total: 0,
    pageSize: 20
  };

  try {
    const result = await getRefunds(filters);
    refunds = result.data;
    metadata = result.metadata;
  } catch (error) {
    console.error('[billing/refunds] Error fetching refunds:', error);
  }

  // Calculate summary statistics from metadata or current page data
  const totalRefunds = metadata?.total || refunds.length;
  const pendingApprovals = refunds.filter(
    (r) => r.approval_status === 'pending'
  ).length;
  const totalRefundAmount = refunds.reduce(
    (sum, r) => sum + (r.net_refund_amount || r.refund_amount),
    0
  );
  const completedRefunds = refunds.filter(
    (r) => r.approval_status === 'processed'
  ).length;

  return (
    <ContentLayout title='Refund Management'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Refund Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage refund requests, processing, and approval workflows
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button className='w-full sm:w-auto' asChild>
              <Link href='/billing/refunds/new'>
                <Plus className='mr-2 h-4 w-4' />
                Process Refund
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/billing/refunds/policies'>
                <CreditCard className='mr-2 h-4 w-4' />
                Policies
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/billing/refunds/bulk'>
                <TrendingUp className='mr-2 h-4 w-4' />
                Bulk Process
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Refunds
              </CardTitle>
              <CreditCard className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totalRefunds}</div>
              <p className='text-xs text-muted-foreground'>
                {metadata?.total ? 'All time' : 'Current page'} refunds
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Pending Approvals
              </CardTitle>
              <RefreshCw className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>
                {pendingApprovals}
              </div>
              <p className='text-xs text-muted-foreground'>Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Amount</CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>
                ₹{totalRefundAmount.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground'>
                {metadata?.total ? 'All time' : 'Current page'} refunded
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Completion Rate
              </CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {totalRefunds > 0
                  ? Math.round((completedRefunds / totalRefunds) * 100)
                  : 0}
                %
              </div>
              <p className='text-xs text-muted-foreground'>
                Processing success rate
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters (Client Component) */}
        <RefundsFiltersClient />

        {/* Data Table (Server Component with Suspense) */}
        <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
          <RefundsTableServer refunds={refunds} metadata={metadata} />
        </Suspense>

        {/* Pagination (Client Component) */}
        <RefundsPaginationClient
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          totalItems={metadata.total}
        />
      </div>
    </ContentLayout>
  );
}
