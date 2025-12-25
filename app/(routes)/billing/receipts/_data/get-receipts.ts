/**
 * Server-side data fetching for Billing Receipts List
 *
 * Cached server function for fetching receipts with filters and pagination.
 */



import { createClient } from '@/lib/supabase/server';


import type { BillingReceipt, ReceiptFilters } from '@/types/billing-schedule';

interface GetReceiptsResult {
  data: BillingReceipt[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get receipts with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial data needs to be fairly fresh
 */
export async function getReceipts(
  filters: ReceiptFilters = {}
): Promise<GetReceiptsResult> {
  if (filters.student_id) {
  }

  const supabase = await createClient();

  let query = supabase.from('billing_receipts').select(
    `
      *,
      student:students(
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
      refunds:billing_refunds(
        id,
        refund_amount,
        approval_status
      )
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (filters.search) {
    query = query.or(
      `receipt_number.ilike.%${filters.search}%,payer_name.ilike.%${filters.search}%`
    );
  }

  if (filters.student_id) {
    query = query.eq('student_id', filters.student_id);
  }

  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }

  if (filters.payment_mode) {
    query = query.eq('payment_mode', filters.payment_mode);
  }

  if (filters.receipt_date_from) {
    query = query.gte('receipt_date', filters.receipt_date_from);
  }

  if (filters.receipt_date_to) {
    query = query.lte('receipt_date', filters.receipt_date_to);
  }

  if (filters.amount_from) {
    query = query.gte('payment_amount', filters.amount_from);
  }

  if (filters.amount_to) {
    query = query.lte('payment_amount', filters.amount_to);
  }

  if (filters.payer_name) {
    query = query.ilike('payer_name', `%${filters.payer_name}%`);
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'receipt_date';
  const sortDirection = filters.sortDirection || 'desc';
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('[getReceipts] Error fetching receipts:', error);
    throw new Error(`Failed to fetch receipts: ${error.message}`);
  }

  return {
    data: (data as BillingReceipt[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  };
}
