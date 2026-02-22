/**
 * Server-side data fetching for Single Invoice
 *
 * Cached server function for fetching individual invoice details.
 */



import { createClient } from '@/lib/supabase/server';


import type { BillingInvoice } from '@/types/billing-schedule';
import { notFound } from 'next/navigation';

/**
 * Get invoice by ID with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial data should be reasonably fresh
 * - Cache tags allow targeted invalidation when invoice is updated
 */
export async function getInvoice(id: string): Promise<BillingInvoice> {
  // Apply cache profile for warm data (5 minutes));

  // Add cache tags for invalidation););

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('billing_invoices')
    .select(
      `
      *,
      student:learners_profiles(
        id,
        first_name,
        last_name,
        roll_number,
        college_email
      ),
      institution:institutions!fk_billing_invoices_institution(
        id,
        name,
        counselling_code
      ),
      invoice_items:billing_invoice_items(
        id,
        receipt_id,
        amount,
        receipt:billing_receipts(
          id,
          receipt_number,
          payment_amount,
          payment_mode,
          receipt_date
        )
      )
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getInvoice] Error fetching invoice:', error);

    // If not found, trigger Next.js 404 page
    if (error.code === 'PGRST116') {
      notFound();
    }

    throw new Error(`Failed to fetch invoice: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return data as BillingInvoice;
}
