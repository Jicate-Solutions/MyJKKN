/**
 * Receipt Detail Page - Server Component
 *
 * Server-rendered receipt details with cached data fetching.
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PageSkeleton } from '@/components/Loading';
import { getReceipt } from '../_data/get-receipt';
import { ReceiptActionsClient } from './_components/receipt-actions-client';
import { ReceiptDetailsServer } from './_components/receipt-details-server';

interface ReceiptDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ReceiptDetailsPage({
  params
}: ReceiptDetailsPageProps) {
  const { id } = await params;

  try {
    // Fetch receipt server-side with caching
    const receipt = await getReceipt(id);

    return (
      <ContentLayout title={`Receipt ${receipt.receipt_number}`}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Receipts', href: '/billing/receipts' },
            {
              label: receipt.receipt_number,
              href: `/billing/receipts/${receipt.id}`
            }
          ]}
        />

        <div className='space-y-6 mt-4'>
          {/* Client component for interactive actions */}
          <ReceiptActionsClient receipt={receipt} />

          {/* Server component for display */}
          <Suspense fallback={<PageSkeleton />}>
            <ReceiptDetailsServer receipt={receipt} />
          </Suspense>
        </div>
      </ContentLayout>
    );
  } catch (error) {
    // getReceipt() throws notFound() if receipt doesn't exist
    notFound();
  }
}
