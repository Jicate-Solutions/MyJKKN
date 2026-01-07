/**
 * Invoice Detail Page - Server Component
 *
 * Server-rendered invoice details with cached data fetching.
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PageSkeleton } from '@/components/Loading';
import { getInvoice } from '../_data/get-invoice';
import { InvoiceActionsClient } from './_components/invoice-actions-client';
import { InvoiceDetailsServer } from './_components/invoice-details-server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

interface InvoiceDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function InvoiceDetailsPage({
  params
}: InvoiceDetailsPageProps) {
  const { id } = await params;

  // Get user profile to check role
  const { profile } = await getEnhancedUserProfile();
  const isStudent = profile?.role === 'student';

  try {
    // Fetch invoice server-side with caching
    const invoice = await getInvoice(id);

    return (
      <ContentLayout title={`Invoice ${invoice.invoice_number}`}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Invoices', href: '/billing/invoices' },
            {
              label: invoice.invoice_number,
              href: `/billing/invoices/${invoice.id}`
            }
          ]}
        />

        <div className='space-y-6 mt-4'>
          {/* Client component for interactive actions */}
          <InvoiceActionsClient invoice={invoice} isStudentView={isStudent} />

          {/* Server component for display */}
          <Suspense fallback={<PageSkeleton />}>
            <InvoiceDetailsServer invoice={invoice} />
          </Suspense>
        </div>
      </ContentLayout>
    );
  } catch (error) {
    // getInvoice() throws notFound() if invoice doesn't exist
    notFound();
  }
}
