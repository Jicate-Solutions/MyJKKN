'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, CreditCard, TrendingUp } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useBillingRefunds } from '@/hooks/billing/use-billing-refunds';
import { RefundFilters } from './_components/refund-filters';
import { RefundList } from './_components/refund-list';

export default function BillingRefundsPage() {
  const {
    refunds,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchRefunds
  } = useBillingRefunds();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewRefunds = isSuperAdmin || canAccess('billing.refunds', 'view');
  const canCreateRefunds =
    isSuperAdmin || canAccess('billing.refunds', 'create');

  useEffect(() => {
    fetchRefunds();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Refund Management'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewRefunds) {
    return (
      <ContentLayout title='Refund Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing refunds.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Refund Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchRefunds()}
            className='mt-4'
            disabled={!canViewRefunds}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Calculate summary statistics
  const totalRefunds = refunds.length;
  const pendingApprovals = refunds.filter(
    (r: any) => r.approval_status === 'pending'
  ).length;
  const totalRefundAmount = refunds.reduce(
    (sum: number, r: any) => sum + r.net_refund_amount,
    0
  );
  const completedRefunds = refunds.filter(
    (r: any) => r.approval_status === 'completed'
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
            {canCreateRefunds ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/refunds/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Process Refund
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Process Refund
              </Button>
            )}
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
              <p className='text-xs text-muted-foreground'>All time refunds</p>
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
              <CardTitle className='text-sm font-medium'>
                Total Amount
              </CardTitle>
              <TrendingUp className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>
                ₹{totalRefundAmount.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground'>Total refunded</p>
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

        <Card>
          <CardContent className='p-6'>
            <RefundFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <RefundList
                refunds={refunds}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchRefunds}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
