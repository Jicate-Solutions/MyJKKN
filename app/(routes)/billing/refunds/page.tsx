/**
 * Billing Refund Requests List Page - Server Component
 *
 * Server-rendered page with cached data fetching.
 * Uses URL search params for filtering instead of client state.
 */

import { Suspense } from 'react';
import { CreditCard, RefreshCw, Wallet, TrendingUp } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { TableSkeleton } from '@/components/Loading';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { getRefundRequests, getRefundRequestStats } from './_data/get-refund-requests';
import { RefundRequestsTableServer } from './_components/requests-table-server';
import { RefundRequestsFiltersClient } from './_components/requests-filters-client';
import { RefundsPaginationClient } from './_components/refunds-pagination-client';
import type { RefundRequestStatus, RefundType } from '@/types/billing-refund-workflow';

interface SearchParams {
  page?: string;
  limit?: string;
  status?: string;
  refund_type?: string;
  institution_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

interface BillingRefundRequestsPageProps {
  searchParams: Promise<SearchParams>;
}

const STATUS_TABS: { label: string; value: RefundRequestStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending Review', value: 'pending_review' },
  { label: 'Pending Disbursement', value: 'pending_disbursement' },
  { label: 'Disbursed', value: 'disbursed' },
  { label: 'Declined', value: 'declined' }
];

export default async function BillingRefundRequestsPage({
  searchParams
}: BillingRefundRequestsPageProps) {
  const params = await searchParams;

  // Build filters from URL params
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    limit: params.limit ? parseInt(params.limit) : 10,
    status: params.status as RefundRequestStatus | undefined,
    refund_type: params.refund_type as RefundType | undefined,
    institution_id: params.institution_id,
    search: params.search,
    date_from: params.date_from,
    date_to: params.date_to
  };

  // Fetch data server-side with caching
  const [{ data: requests, metadata }, stats] = await Promise.all([
    getRefundRequests(filters),
    getRefundRequestStats({ institution_id: filters.institution_id })
  ]);

  // Build tab hrefs that preserve every filter except status/page
  const buildTabHref = (status: RefundRequestStatus | undefined) => {
    const tabParams = new URLSearchParams();
    if (params.limit) tabParams.set('limit', params.limit);
    if (params.refund_type) tabParams.set('refund_type', params.refund_type);
    if (params.institution_id) tabParams.set('institution_id', params.institution_id);
    if (params.search) tabParams.set('search', params.search);
    if (params.date_from) tabParams.set('date_from', params.date_from);
    if (params.date_to) tabParams.set('date_to', params.date_to);
    if (status) tabParams.set('status', status);
    tabParams.set('page', '1');
    return `/billing/refunds?${tabParams.toString()}`;
  };

  return (
    <ContentLayout title='Refund Requests'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Refunds', href: '/billing/refunds' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Refund Requests</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Track refund requests through the review and disbursement workflow
          </p>
        </div>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Requests
              </CardTitle>
              <CreditCard className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{metadata.total}</div>
              <p className='text-xs text-muted-foreground'>All time requests</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Pending Review
              </CardTitle>
              <RefreshCw className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-600'>
                {stats.pendingReview}
              </div>
              <p className='text-xs text-muted-foreground'>Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Pending Disbursement
              </CardTitle>
              <Wallet className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>
                {stats.pendingDisbursement}
              </div>
              <p className='text-xs text-muted-foreground'>Approved, awaiting disbursement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Disbursed Amount</CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>
                ₹{stats.disbursedAmount.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground'>All time disbursed</p>
            </CardContent>
          </Card>
        </div>

        {/* Status Tabs */}
        <div className='flex flex-wrap gap-2 border-b'>
          {STATUS_TABS.map((tab) => {
            const isActive = (params.status || undefined) === tab.value;
            return (
              <Link
                key={tab.label}
                href={buildTabHref(tab.value)}
                className={cn(
                  'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Filters (Client Component) */}
        <RefundRequestsFiltersClient />

        {/* Data Table (Server Component with Suspense) */}
        <Suspense fallback={<TableSkeleton rows={10} columns={8} />}>
          <RefundRequestsTableServer requests={requests} metadata={metadata} />
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
