'use client';
/**
 * Consultant Commission Payment Requests List Page - Client Component
 *
 * Adapted from the billing refund requests list. Uses the
 * useCommissionPaymentRequests hook (RLS scopes the rows) and keeps
 * status / search / page in the URL so the view is shareable.
 */

import { Suspense, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { BeatLoader } from 'react-spinners';
import {
  Ban, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, TrendingUp, Wallet
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn, getErrorMessage } from '@/lib/utils';
import { useCommissionPaymentRequests } from '@/hooks/admission/use-commission-payments';
import type {
  CommissionPaymentRequest,
  CommissionPaymentStatus
} from '@/types/consultant-commission-payment';

const PAGE_SIZE = 10;
// Upper bound for summing the Disbursed amount card client-side.
const DISBURSED_SUM_LIMIT = 1000;

const STATUS_TABS: { label: string; value: CommissionPaymentStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending Review', value: 'pending_review' },
  { label: 'Pending Disbursement', value: 'pending_disbursement' },
  { label: 'Disbursed', value: 'disbursed' },
  { label: 'Declined', value: 'declined' }
];

const VALID_STATUSES = STATUS_TABS.map((t) => t.value).filter(Boolean) as CommissionPaymentStatus[];

const formatAdmissionYear = (y: number | null | undefined) =>
  y == null ? '—' : `${y}-${y + 1}`;

const formatAmount = (n: number | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

function getStatusBadge(status: CommissionPaymentStatus) {
  switch (status) {
    case 'disbursed':
      return <Badge variant='success'>Disbursed</Badge>;
    case 'declined':
      return <Badge variant='destructive'>Declined</Badge>;
    case 'pending_disbursement':
      return (
        <Badge variant='outline' className='bg-blue-100 text-blue-800 border-blue-200'>
          Pending Disbursement
        </Badge>
      );
    case 'pending_review':
    default:
      return (
        <Badge variant='outline' className='bg-yellow-100 text-yellow-800 border-yellow-200'>
          Pending Review
        </Badge>
      );
  }
}

function getCurrentStage(request: CommissionPaymentRequest) {
  if (request.status === 'pending_disbursement') return 'Disbursement';
  if (request.status !== 'pending_review') return '—';
  const stage = request.flow_snapshot?.stages?.[request.current_stage_index];
  return stage?.name || '—';
}

function CommissionPaymentsListClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const rawStatus = searchParams.get('status');
  const status = VALID_STATUSES.includes(rawStatus as CommissionPaymentStatus)
    ? (rawStatus as CommissionPaymentStatus)
    : undefined;
  const search = searchParams.get('search') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);

  // Local input state, pushed to the URL after a short debounce.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  useEffect(() => {
    if (searchInput.trim() === search) return;
    const t = setTimeout(() => updateParams({ search: searchInput.trim() || undefined, page: '1' }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isError, error } = useCommissionPaymentRequests({
    page,
    limit: PAGE_SIZE,
    status,
    search: search || undefined
  });

  // Summary cards: counts come from metadata.total with limit 1.
  const pendingReviewQ = useCommissionPaymentRequests({ status: 'pending_review', limit: 1 });
  const pendingDisbursementQ = useCommissionPaymentRequests({ status: 'pending_disbursement', limit: 1 });
  const declinedQ = useCommissionPaymentRequests({ status: 'declined', limit: 1 });
  const disbursedQ = useCommissionPaymentRequests({ status: 'disbursed', limit: DISBURSED_SUM_LIMIT });

  const disbursedAmount = (disbursedQ.data?.data ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0
  );

  const requests = data?.data ?? [];
  const metadata = data?.metadata ?? { total: 0, page, limit: PAGE_SIZE, totalPages: 0 };

  const buildTabHref = (tabStatus: CommissionPaymentStatus | undefined) => {
    const tabParams = new URLSearchParams();
    if (search) tabParams.set('search', search);
    if (tabStatus) tabParams.set('status', tabStatus);
    tabParams.set('page', '1');
    return `/admission/consultants/commission-payments?${tabParams.toString()}`;
  };

  const statValue = (n: number | undefined) => (n == null ? '—' : n);

  return (
    <div className='space-y-6 mt-4'>
      <div>
        <h1 className='text-2xl font-bold py-1'>Commission Payments</h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Track consultant commission payments through the review and disbursement workflow
        </p>
      </div>

      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Pending Review</CardTitle>
            <RefreshCw className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-yellow-600'>
              {statValue(pendingReviewQ.data?.metadata.total)}
            </div>
            <p className='text-xs text-muted-foreground'>Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Pending Disbursement</CardTitle>
            <Wallet className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {statValue(pendingDisbursementQ.data?.metadata.total)}
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
              {disbursedQ.data ? formatAmount(disbursedAmount) : '—'}
            </div>
            <p className='text-xs text-muted-foreground'>All time disbursed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Declined</CardTitle>
            <Ban className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {statValue(declinedQ.data?.metadata.total)}
            </div>
            <p className='text-xs text-muted-foreground'>Declined requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Tabs */}
      <div className='flex flex-wrap gap-2 border-b'>
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
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

      {/* Search */}
      <div className='relative max-w-sm'>
        <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          placeholder='Request number...'
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className='pl-9'
        />
      </div>

      {/* Data Table */}
      {isLoading ? (
        <div className='flex items-center justify-center min-h-[200px]'>
          <BeatLoader color='#00e902' />
        </div>
      ) : isError ? (
        <p className='text-destructive py-8 text-center'>{getErrorMessage(error)}</p>
      ) : requests.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-12 text-center'>
          <p className='text-muted-foreground'>No commission payment requests found</p>
          <p className='text-sm text-muted-foreground mt-2'>Try adjusting your filters</p>
        </div>
      ) : (
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request #</TableHead>
                <TableHead>Consultant</TableHead>
                <TableHead>Admission Year</TableHead>
                <TableHead className='text-right'>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Initiated</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className='font-medium'>{request.request_number}</TableCell>
                  <TableCell>
                    <div className='font-medium'>{request.consultant?.name ?? '—'}</div>
                    {request.consultant?.code && (
                      <div className='text-xs text-muted-foreground'>{request.consultant.code}</div>
                    )}
                  </TableCell>
                  <TableCell>{formatAdmissionYear(request.academic_year)}</TableCell>
                  <TableCell className='text-right'>{formatAmount(request.total_amount)}</TableCell>
                  <TableCell>{getStatusBadge(request.status)}</TableCell>
                  <TableCell>{getCurrentStage(request)}</TableCell>
                  <TableCell>
                    <div>
                      {request.initiated_at ? format(new Date(request.initiated_at), 'PP') : '-'}
                    </div>
                    {request.initiator?.full_name && (
                      <div className='text-xs text-muted-foreground'>{request.initiator.full_name}</div>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button variant='ghost' size='sm' asChild>
                      <Link href={`/admission/consultants/commission-payments/${request.id}`}>
                        <Eye className='h-4 w-4' />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t text-sm text-muted-foreground'>
            <span>
              Showing {requests.length} of {metadata.total} commission payment requests (Page{' '}
              {metadata.page} of {Math.max(metadata.totalPages, 1)})
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1 || isPending}
                onClick={() => updateParams({ page: String(page - 1) })}
              >
                <ChevronLeft className='h-4 w-4 mr-1' />
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= metadata.totalPages || isPending}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                Next
                <ChevronRight className='h-4 w-4 ml-1' />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommissionPaymentsPage() {
  return (
    <ContentLayout title='Commission Payments'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admission', href: '/admission' },
          { label: 'Consultants', href: '/admission/consultants' },
          { label: 'Commission Payments', href: '/admission/consultants/commission-payments' }
        ]}
      />
      {/* useSearchParams requires a Suspense boundary */}
      <Suspense fallback={null}>
        <CommissionPaymentsListClient />
      </Suspense>
    </ContentLayout>
  );
}
