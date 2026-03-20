/**
 * Server-side data fetching for Billing Invoices List
 *
 * Cached server function for fetching invoices with filters and pagination.
 */



import { createClient } from '@/lib/supabase/server';


import type { BillingInvoice, InvoiceFilters } from '@/types/billing-schedule';

interface GetInvoicesResult {
  data: BillingInvoice[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get invoices with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Financial data needs to be fairly fresh
 * - Cache tags allow targeted invalidation when invoices are created/updated
 */
export async function getInvoices(
  filters: InvoiceFilters = {}
): Promise<GetInvoicesResult> {
  // Apply cache profile for warm data (5 minutes)

  // Add cache tags for invalidation
  if (filters.institution_id) {
  }
  if (filters.student_id) {
  }

  const supabase = await createClient();

  // Build query with relations
  let query = supabase.from('billing_invoices').select(
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
      invoice_items:billing_invoice_items(
        id,
        receipt_id,
        amount,
        receipt:billing_receipts(
          id,
          receipt_number,
          payment_amount
        )
      )
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (filters.search) {
    query = query.or(
      `invoice_number.ilike.%${filters.search}%,invoice_description.ilike.%${filters.search}%`
    );
  }

  if (filters.student_id) {
    query = query.eq('student_id', filters.student_id);
  }

  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }

  if (filters.invoice_type) {
    query = query.eq('invoice_type', filters.invoice_type);
  }

  if (filters.invoice_date_from) {
    query = query.gte('invoice_date', filters.invoice_date_from);
  }

  if (filters.invoice_date_to) {
    query = query.lte('invoice_date', filters.invoice_date_to);
  }

  if (filters.billing_period_from) {
    query = query.gte('billing_period_from', filters.billing_period_from);
  }

  if (filters.billing_period_to) {
    query = query.lte('billing_period_to', filters.billing_period_to);
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'created_at';
  const sortDirection = filters.sortDirection || 'desc';
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.range(from, to);

  // Execute query
  const { data, count, error } = await query;

  if (error) {
    console.error('[getInvoices] Error fetching invoices:', error);
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  return {
    data: (data as BillingInvoice[]) || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  };
}
