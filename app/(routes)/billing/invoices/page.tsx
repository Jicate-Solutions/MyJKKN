'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { useBillingInvoices } from '@/hooks/billing/use-billing-invoices';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { InvoiceList } from './_components/invoice-list';
import { InvoiceFilters } from './_components/invoice-filters';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';

export default function BillingInvoicesPage() {
  const {
    invoices,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchInvoices
  } = useBillingInvoices();

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewInvoices = isSuperAdmin || canAccess('billing.invoices', 'view');
  const canCreateInvoices =
    isSuperAdmin || canAccess('billing.invoices', 'create');

  useEffect(() => {
    fetchInvoices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Billing Invoices'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewInvoices) {
    return (
      <ContentLayout title='Billing Invoices'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view billing invoices.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Billing Invoices'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => fetchInvoices()}
            className='mt-4'
            disabled={!canViewInvoices}
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Billing Invoices'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing' },
          { label: 'Invoices', href: '/billing/invoices' }
        ]}
      />
      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Billing Invoices</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Professional invoicing system with taxation and compliance
              features
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2'>
            {canCreateInvoices ? (
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/invoices/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Create Invoice
                </Link>
              </Button>
            ) : (
              <Button
                className='w-full sm:w-auto opacity-50'
                disabled
                variant='outline'
              >
                <Plus className='mr-2 h-4 w-4' />
                Create Invoice
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='p-6'>
            <InvoiceFilters filters={filters} onFilterChange={updateFilters} />

            {loading ? (
              <div className='flex justify-center items-center p-8'>
                <BeatLoader color='#00e902' />
              </div>
            ) : (
              <InvoiceList
                invoices={invoices}
                metadata={metadata}
                onPageChange={changePage}
                onRefresh={fetchInvoices}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
