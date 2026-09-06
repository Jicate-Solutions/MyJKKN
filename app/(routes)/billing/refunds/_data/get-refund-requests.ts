/**
 * Server-side data fetching for Billing Refund Requests List
 *
 * Cached server function for fetching refund requests with filters and pagination.
 */

import { createClient } from '@/lib/supabase/server';

import type { RefundRequest, RefundRequestFilters } from '@/types/billing-refund-workflow';

interface GetRefundRequestsResult {
  data: RefundRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RefundRequestStats {
  pendingReview: number;
  pendingDisbursement: number;
  disbursedAmount: number;
}

/**
 * Get refund requests with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial refund data needs to be fairly fresh
 */
export async function getRefundRequests(
  filters: RefundRequestFilters = {}
): Promise<GetRefundRequestsResult> {
  const supabase = await createClient();

  let query = supabase.from('billing_refund_requests').select(
    `
      *,
      student:learners_profiles(id, first_name, last_name, roll_number, lifecycle_status)
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.refund_type) {
    query = query.eq('refund_type', filters.refund_type);
  }

  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }

  if (filters.search) {
    query = query.ilike('request_number', `%${filters.search}%`);
  }

  if (filters.date_from) {
    query = query.gte('initiated_at', filters.date_from);
  }

  if (filters.date_to) {
    // date_to is a bare YYYY-MM-DD; initiated_at is timestamptz. Extend to the
    // end of that day so the selected end date is inclusive (repo convention).
    query = query.lte('initiated_at', `${filters.date_to}T23:59:59Z`);
  }

  // Apply sorting
  query = query.order('initiated_at', { ascending: false });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('[getRefundRequests] Error fetching refund requests:', error);
    throw new Error(`Failed to fetch refund requests: ${error.message}`);
  }

  return {
    data: (data as RefundRequest[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  };
}

/**
 * Get refund request summary stats scoped by the same filters as the list.
 *
 * Runs cheap `count`-only / narrow-select queries instead of deriving stats
 * from the current page slice (the old refunds list did that, which produced
 * "Current page" totals that reset per page — a defect, not a feature).
 */
export async function getRefundRequestStats(
  filters: Pick<RefundRequestFilters, 'institution_id'> = {}
): Promise<RefundRequestStats> {
  const supabase = await createClient();

  let pendingReviewQuery = supabase
    .from('billing_refund_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review');
  let pendingDisbursementQuery = supabase
    .from('billing_refund_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_disbursement');
  let disbursedAmountQuery = supabase
    .from('billing_refund_requests')
    .select('total_refund_amount')
    .eq('status', 'disbursed');

  if (filters.institution_id) {
    pendingReviewQuery = pendingReviewQuery.eq('institution_id', filters.institution_id);
    pendingDisbursementQuery = pendingDisbursementQuery.eq('institution_id', filters.institution_id);
    disbursedAmountQuery = disbursedAmountQuery.eq('institution_id', filters.institution_id);
  }

  const [pendingReviewResult, pendingDisbursementResult, disbursedAmountResult] = await Promise.all([
    pendingReviewQuery,
    pendingDisbursementQuery,
    disbursedAmountQuery
  ]);

  if (pendingReviewResult.error) {
    throw new Error(`Failed to fetch pending review count: ${pendingReviewResult.error.message}`);
  }
  if (pendingDisbursementResult.error) {
    throw new Error(`Failed to fetch pending disbursement count: ${pendingDisbursementResult.error.message}`);
  }
  if (disbursedAmountResult.error) {
    throw new Error(`Failed to fetch disbursed amount: ${disbursedAmountResult.error.message}`);
  }

  const disbursedAmount = (disbursedAmountResult.data || []).reduce(
    (sum, row) => sum + Number((row as { total_refund_amount: number }).total_refund_amount || 0),
    0
  );

  return {
    pendingReview: pendingReviewResult.count || 0,
    pendingDisbursement: pendingDisbursementResult.count || 0,
    disbursedAmount
  };
}
