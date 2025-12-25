/**
 * Server-side data fetching for Billing Refunds List
 *
 * Cached server function for fetching refunds with filters and pagination.
 */



import { createClient } from '@/lib/supabase/server';


import type { BillingRefund } from '@/types/billing-schedule';

interface RefundFilters {
  page?: number;
  limit?: number;
  search?: string;
  receipt_id?: string;
  student_id?: string;
  institution_id?: string;
  approval_status?: string;
  refund_category?: string;
  refund_date_from?: string;
  refund_date_to?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

interface GetRefundsResult {
  data: BillingRefund[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get refunds with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial refund data needs to be fairly fresh
 */
export async function getRefunds(
  filters: RefundFilters = {}
): Promise<GetRefundsResult> { // Refunds affect receipts
  if (filters.receipt_id) {
  }

  const supabase = await createClient();

  let query = supabase.from('billing_refunds').select(
    `
      *,
      receipt:billing_receipts(
        id,
        receipt_number,
        payment_amount,
        student:students(
          id,
          first_name,
          last_name,
          roll_number,
          college_email
        )
      ),
      authorizer:profiles!fk_billing_refunds_authorizer(id, full_name),
      approver:profiles!fk_billing_refunds_approved_by(id, full_name)
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (filters.search) {
    query = query.or(
      `refund_reason.ilike.%${filters.search}%,refund_reference_number.ilike.%${filters.search}%`
    );
  }

  if (filters.receipt_id) {
    query = query.eq('receipt_id', filters.receipt_id);
  }

  if (filters.approval_status) {
    query = query.eq('approval_status', filters.approval_status);
  }

  if (filters.refund_category) {
    query = query.eq('refund_category', filters.refund_category);
  }

  if (filters.refund_date_from) {
    query = query.gte('refund_date', filters.refund_date_from);
  }

  if (filters.refund_date_to) {
    query = query.lte('refund_date', filters.refund_date_to);
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'refund_date';
  const sortDirection = filters.sortDirection || 'desc';
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('[getRefunds] Error fetching refunds:', error);
    throw new Error(`Failed to fetch refunds: ${error.message}`);
  }

  return {
    data: (data as BillingRefund[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  };
}
