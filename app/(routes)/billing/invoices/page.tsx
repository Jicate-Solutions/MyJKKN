/**
 * Billing Invoices List Page - Server Component
 *
 * Server-rendered page with cached data fetching.
 * Uses URL search params for filtering instead of client state.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { getInvoices } from './_data/get-invoices';
import { InvoicesTableServer } from './_components/invoices-table-server';
import { InvoicesFiltersClient } from './_components/invoices-filters-client';
import { InvoicesPaginationClient } from './_components/invoices-pagination-client';
import { TableSkeleton } from '@/components/Loading';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

interface SearchParams {
  page?: string;
  limit?: string;
  search?: string;
  institution_id?: string;
  student_id?: string;
  invoice_type?: string;
  invoice_date_from?: string;
  invoice_date_to?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface BillingInvoicesPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function BillingInvoicesPage({
  searchParams
}: BillingInvoicesPageProps) {
  const params = await searchParams;

  // Get user profile to check role
  const { profile } = await getEnhancedUserProfile();
  const isStudent = profile?.role === 'student';

  // Build filters from URL params
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    limit: params.limit ? parseInt(params.limit) : 10,
    search: params.search,
    institution_id: params.institution_id,
    student_id: params.student_id,
    invoice_type: params.invoice_type as
      | 'individual'
      | 'consolidated'
      | undefined,
    invoice_date_from: params.invoice_date_from,
    invoice_date_to: params.invoice_date_to,
    sortBy: params.sortBy || 'created_at',
    sortDirection: (params.sortDirection as 'asc' | 'desc') || 'desc'
  };

  // Fetch data server-side with caching
  let invoices: Awaited<ReturnType<typeof getInvoices>>['data'] = [];
  let metadata: Awaited<ReturnType<typeof getInvoices>>['metadata'] = {
    page: 1,
    totalPages: 0,
    total: 0,
    pageSize: 20
  };

  try {
    const result = await getInvoices(filters);
    invoices = result.data;
    metadata = result.metadata;
  } catch (error) {
    console.error('[billing/invoices] Error fetching invoices:', error);
  }

  return (
    <ContentLayout title='Billing Invoices'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
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
          {/* Hide Create Invoice button for students */}
          {!isStudent && (
            <div className='flex flex-col sm:flex-row gap-2'>
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/invoices/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Create Invoice
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Filters (Client Component) */}
        <InvoicesFiltersClient />

        {/* Data Table (Server Component with Suspense) */}
        <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
          <InvoicesTableServer invoices={invoices} metadata={metadata} isStudentView={isStudent} />
        </Suspense>

        {/* Pagination (Client Component) */}
        <InvoicesPaginationClient
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          totalItems={metadata.total}
        />
      </div>
    </ContentLayout>
  );
}
