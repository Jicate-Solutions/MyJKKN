'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Percent, TrendingDown } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { DiscountList } from './_components/discount-list';
import { DiscountFilters } from './_components/discount-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useBillingDiscounts } from '@/hooks/billing/use-billing-discounts';

export default function BillingDiscountsPage() {
  const {
    discounts,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchDiscounts
  } = useBillingDiscounts();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'view');
  const canCreateDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'create');

  useEffect(() => {
    fetchDiscounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Discount Management'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewDiscounts) {
    return (
      <ContentLayout title='Discount Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing discounts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Discount Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchDiscounts()}
            className='mt-4'
            disabled={!canViewDiscounts}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Calculate summary statistics
  const totalDiscounts = discounts.length;
  const pendingApprovals = discounts.filter(
    (d) => d.approval_status === 'pending'
  ).length;
  const totalDiscountAmount = discounts.reduce(
    (sum, d) => sum + d.discount_amount,
    0
  );
  const approvedDiscounts = discounts.filter(
    (d) => d.approval_status === 'approved'
  ).length;

  return (
    <ContentLayout title='Discount Management'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Discounts', href: '/billing/discounts' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Discount Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage discount policies, approvals, and bulk discount operations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateDiscounts ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/discounts/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Apply Discount
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Apply Discount
              </Button>
            )}
            <Button variant='outline' asChild>
              <Link href='/billing/discounts/policies'>
                <Percent className='mr-2 h-4 w-4' />
                Policies
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/billing/discounts/bulk'>
                <TrendingDown className='mr-2 h-4 w-4' />
                Bulk Apply
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Discounts
              </CardTitle>
              <Percent className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totalDiscounts}</div>
              <p className='text-xs text-muted-foreground'>
                All time discounts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Pending Approvals
              </CardTitle>
              <TrendingDown className='h-4 w-4 text-muted-foreground' />
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
              <TrendingDown className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>
                ₹{totalDiscountAmount.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground'>Total discounted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Approved Rate
              </CardTitle>
              <Percent className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {totalDiscounts > 0
                  ? Math.round((approvedDiscounts / totalDiscounts) * 100)
                  : 0}
                %
              </div>
              <p className='text-xs text-muted-foreground'>
                Approval success rate
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DiscountFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <DiscountList
                discounts={discounts}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchDiscounts}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
