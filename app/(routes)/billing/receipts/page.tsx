'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { ReceiptList } from './_components/receipt-list';
import { ReceiptFilters } from './_components/receipt-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { useBillingReceipts } from '@/hooks/billing/use-billing-receipts';

export default function BillingReceiptsPage() {
  const {
    receipts,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchReceipts
  } = useBillingReceipts();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewReceipts = isSuperAdmin || canAccess('billing.receipts', 'view');
  const canCreateReceipts =
    isSuperAdmin || canAccess('billing.receipts', 'create');

  useEffect(() => {
    fetchReceipts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Receipt Management'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewReceipts) {
    return (
      <ContentLayout title='Receipt Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing receipts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Receipt Management'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchReceipts()}
            className='mt-4'
            disabled={!canViewReceipts}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Receipt Management'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Receipts', href: '/billing/receipts' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Receipt Management</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              View payment receipts and manage receipt templates. Generate receipts from student billing details.
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            <Button variant='outline' asChild>
              <Link href='/billing/receipts/templates'>
                <Receipt className='mr-2 h-4 w-4' />
                Templates
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ReceiptFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <ReceiptList
                receipts={receipts}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchReceipts}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
