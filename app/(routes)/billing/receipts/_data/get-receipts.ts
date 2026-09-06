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

  // Ownership filter. billing_receipts has no category of its own, so this walks
  // receipt_items -> bill -> category via chained !inner embeds, making it
  // "receipts containing AT LEAST ONE line of this ownership" — one payment can
  // settle both, so a mixed receipt appears under either option. Only added when
  // the filter is on, so the default list keeps its existing (cheaper) shape.
  // Verified against PostgREST: the nested dotted filter path resolves and
  // count=exact is NOT inflated by the join.
  const ownershipEmbed = filters.collection_type
    ? `,
      collection_lines:billing_receipt_items!inner(
        bill:billing_student_bills!inner(
          category:billing_categories!inner(collection_type)
        )
      )`
    : '';

  let query = supabase.from('billing_receipts').select(
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
      refunds:billing_refunds(
        id,
        refund_amount,
        approval_status
      )${ownershipEmbed}
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (filters.collection_type) {
    query = query.eq(
      'collection_lines.bill.category.collection_type',
      filters.collection_type
    );
  }

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

  // Apply sorting. 'student_name' is a filter-UI option (receipts-filters-client.tsx)
  // but billing_receipts has no such column — it lives on the embedded `student`
  // (learners_profiles) relation, so it must be ordered via referencedTable rather
  // than passed straight to .order(), which would otherwise send an unknown-column
  // sort to PostgREST and fail the whole query.
  const sortBy = filters.sortBy || 'receipt_date';
  const sortDirection = filters.sortDirection || 'desc';
  const ascending = sortDirection === 'asc';
  if (sortBy === 'student_name') {
    query = query
      .order('first_name', { referencedTable: 'student', ascending })
      .order('last_name', { referencedTable: 'student', ascending });
  } else {
    query = query.order(sortBy, { ascending });
  }

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
    // Double cast: supabase-js parses the select string at COMPILE time, so the
    // conditional ownership embed above makes it a dynamic string it cannot
    // parse — it infers ParserError rather than a row type. The query itself is
    // valid (verified against the live REST API); only the static inference is
    // defeated.
    data: (data as unknown as BillingReceipt[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  };
}
