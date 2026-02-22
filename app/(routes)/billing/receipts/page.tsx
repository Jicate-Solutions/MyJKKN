/**
 * Billing Receipts List Page - Server Component
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
import { TableSkeleton } from '@/components/Loading';
import { getReceipts } from './_data/get-receipts';
import { ReceiptsTableServer } from './_components/receipts-table-server';
import { ReceiptsFiltersClient } from './_components/receipts-filters-client';
import { ReceiptsPaginationClient } from './_components/receipts-pagination-client';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

interface SearchParams {
  page?: string;
  limit?: string;
  search?: string;
  institution_id?: string;
  student_id?: string;
  payment_mode?: string;
  receipt_date_from?: string;
  receipt_date_to?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface BillingReceiptsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function BillingReceiptsPage({
  searchParams
}: BillingReceiptsPageProps) {
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
    payment_mode: params.payment_mode as
      | 'cash'
      | 'online'
      | 'bank_transfer'
      | 'dd'
      | 'cheque'
      | undefined,
    receipt_date_from: params.receipt_date_from,
    receipt_date_to: params.receipt_date_to,
    sortBy: params.sortBy || 'receipt_date',
    sortDirection: (params.sortDirection as 'asc' | 'desc') || 'desc'
  };

  // Fetch data server-side with caching
  let receipts: Awaited<ReturnType<typeof getReceipts>>['data'] = [];
  let metadata: Awaited<ReturnType<typeof getReceipts>>['metadata'] = {
    page: 1,
    totalPages: 0,
    total: 0,
    limit: 20
  };

  try {
    const result = await getReceipts(filters);
    receipts = result.data;
    metadata = result.metadata;
  } catch (error) {
    console.error('[billing/receipts] Error fetching receipts:', error);
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
              View payment receipts and manage receipt templates. Generate receipts
              from student billing details.
            </p>
          </div>
          {/* Hide Create Receipt button for students */}
          {!isStudent && (
            <div className='flex flex-col sm:flex-row gap-2'>
              <Button className='w-full sm:w-auto' asChild>
                <Link href='/billing/receipts/new'>
                  <Plus className='mr-2 h-4 w-4' />
                  Create Receipt
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Filters (Client Component) */}
        <ReceiptsFiltersClient />

        {/* Data Table (Server Component with Suspense) */}
        <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
          <ReceiptsTableServer receipts={receipts} metadata={metadata} isStudentView={isStudent} />
        </Suspense>

        {/* Pagination (Client Component) */}
        <ReceiptsPaginationClient
          currentPage={metadata.page}
          totalPages={metadata.totalPages}
          totalItems={metadata.total}
        />
      </div>
    </ContentLayout>
  );
}
