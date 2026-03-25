/**
 * Server-side data fetching for Single Receipt
 *
 * Cached server function for fetching individual receipt details.
 */



import { createClient } from '@/lib/supabase/server';


import type { BillingReceipt } from '@/types/billing-schedule';
import { notFound } from 'next/navigation';

/**
 * Get receipt by ID with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 */
export async function getReceipt(id: string): Promise<BillingReceipt> {

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('billing_receipts')
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
      institution:institutions(
        id,
        name,
        counselling_code
      ),
      receipt_items:billing_receipt_items(
        *,
        bill:billing_student_bills(
          *,
          item_category:billing_item_categories(
            id,
            item_category_name,
            parent_category:billing_parent_categories(
              id,
              parent_category_name
            ),
            sub_category:billing_sub_categories(
              id,
              sub_category_name
            )
          )
        )
      ),
      refunds:billing_refunds(
        *,
        authorizer:profiles!fk_billing_refunds_authorizer(id, full_name),
        approver:profiles!fk_billing_refunds_approved_by(id, full_name)
      ),
      accountant:profiles(id, full_name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getReceipt] Error fetching receipt:', error);

    if (error.code === 'PGRST116') {
      notFound();
    }

    throw new Error(`Failed to fetch receipt: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return data as BillingReceipt;
}
