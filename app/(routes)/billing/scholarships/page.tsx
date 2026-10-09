'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Percent, Settings2, TrendingDown } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ScholarshipList } from './_components/scholarship-list';
import { ScholarshipFilters } from './_components/scholarship-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useBillingScholarships } from '@/hooks/billing/use-billing-scholarships';

export default function BillingScholarshipsPage() {
  const {
    scholarships,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchScholarships
  } = useBillingScholarships();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'view');
  const canCreateScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'create');
  const canViewSetup =
    isSuperAdmin || canAccess('billing.scholarship_setup', 'view');

  useEffect(() => {
    fetchScholarships();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Scholarship Management'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewScholarships) {
    return (
      <ContentLayout title='Scholarship Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing scholarships.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Scholarship Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchScholarships()}
            className='mt-4'
            disabled={!canViewScholarships}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Calculate summary statistics
  const totalScholarships = scholarships.length;
  const pendingApprovals = scholarships.filter(
    (d) => d.approval_status === 'pending'
  ).length;
  const totalScholarshipAmount = scholarships.reduce(
    (sum, d) => sum + d.scholarship_amount,
    0
  );
  const approvedScholarships = scholarships.filter(
    (d) => d.approval_status === 'approved'
  ).length;

  return (
    <ContentLayout title='Scholarship Management'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Scholarships', href: '/billing/scholarships' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Scholarship Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage scholarship policies, approvals, and bulk scholarship
              operations
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateScholarships ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/scholarships/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Apply Scholarship
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Apply Scholarship
              </Button>
            )}
            {canViewSetup && (
              <Button variant='outline' asChild>
                <Link href='/billing/scholarships/setup'>
                  <Settings2 className='mr-2 h-4 w-4' />
                  Categories &amp; Types
                </Link>
              </Button>
            )}
            <Button variant='outline' asChild>
              <Link href='/billing/scholarships/policies'>
                <Percent className='mr-2 h-4 w-4' />
                Policies
              </Link>
            </Button>
            <Button variant='outline' asChild>
              <Link href='/billing/scholarships/bulk'>
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
                Total Scholarships
              </CardTitle>
              <Percent className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totalScholarships}</div>
              <p className='text-xs text-muted-foreground'>
                All time scholarships
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
                ₹{totalScholarshipAmount.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground'>
                Total scholarships
              </p>
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
                {totalScholarships > 0
                  ? Math.round((approvedScholarships / totalScholarships) * 100)
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
            <ScholarshipFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ScholarshipList
                scholarships={scholarships}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchScholarships}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
