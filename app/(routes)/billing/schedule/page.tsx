'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Calendar, Receipt, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';
import { StudentBillList } from './_components/student-bill-list';
import { StudentBillFilters } from './_components/student-bill-filters';
import { useStudentBills } from '@/hooks/billing/use-student-bills';
import { useState } from 'react';
import type { StudentBillFilters as StudentBillFiltersType } from '@/types/billing-schedule';

export default function BillingSchedulePage() {
  const [filters, setFilters] = useState<StudentBillFiltersType>({
    page: 1,
    limit: 10,
    sortBy: 'created_at',
    sortDirection: 'desc'
  });

  const {
    data: billsData,
    isLoading,
    error,
    refetch
  } = useStudentBills(filters);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const canViewBills = isSuperAdmin || canAccess('billing.schedule', 'view');
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');
  const handleFilterChange = (newFilters: Partial<StudentBillFiltersType>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  };
  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }; // Show loading state while permissions are loading  if (permissionsLoading) {    return (      <ContentLayout title='Billing Schedule'>        <div className='flex items-center justify-center min-h-[400px]'>          <BeatLoader color='#00e902' />          <span className='ml-2'>Loading permissions...</span>        </div>      </ContentLayout>    );  }  if (!canViewBills) {    return (      <ContentLayout title='Billing Schedule'>        <div className='text-center py-8'>          <p className='text-destructive'>            You don&apos;t have permission to view billing schedules.          </p>        </div>      </ContentLayout>    );  }

  if (error) {
    return (
      <ContentLayout title='Billing Schedule'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading billing schedules: {error.message}
          </p>
          <Button variant='outline' onClick={() => refetch()} className='mt-4'>
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Schedule'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Schedule', href: '/billing/schedule' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Schedule</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Manage student bills, payments, and billing schedules
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateBills ? (
              <>
                <Button variant='outline' asChild>
                  <Link href='/billing/schedule/bulk-create'>
                    <Users className='mr-2 h-4 w-4' />
                    Bulk Create Bills
                  </Link>
                </Button>
                <Button asChild>
                  <Link href='/billing/schedule/new'>
                    <Plus className='mr-2 h-4 w-4' />
                    Create Bill
                  </Link>
                </Button>
              </>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Create Bill
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
              <Calendar className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {billsData?.metadata.total || 0}
              </div>
              <p className='text-xs text-muted-foreground'>
                Active student bills
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Unpaid Bills
              </CardTitle>
              <Receipt className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>
                {billsData?.data.filter((bill) => bill.status === 'unpaid')
                  .length || 0}
              </div>
              <p className='text-xs text-muted-foreground'>Pending payments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Overdue Bills
              </CardTitle>
              <Receipt className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>
                {billsData?.data.filter((bill) => bill.status === 'overdue')
                  .length || 0}
              </div>
              <p className='text-xs text-muted-foreground'>Past due date</p>
            </CardContent>
          </Card>
        </div>

        {/* Bills List */}
        <Card>
          <CardContent className='p-6'>
            <StudentBillFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />

            {isLoading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <StudentBillList
                bills={billsData?.data || []}
                metadata={
                  billsData?.metadata || {
                    total: 0,
                    page: 1,
                    limit: 10,
                    totalPages: 0
                  }
                }
                onPageChange={handlePageChange}
                onRefresh={() => refetch()}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
