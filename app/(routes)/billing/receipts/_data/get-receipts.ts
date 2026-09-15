/**
 * Server-side data fetching for Billing Receipts List
 *
 * Cached server function for fetching receipts with filters and pagination.
 */



import { sanitizeSearch } from '@/lib/config/pagination';
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
 * A search term matching more learners than this stops being resolved to an
 * inline `student_id.in.(...)` list — that many uuids overflows the PostgREST
 * URL and the whole request fails with a bare "Bad Request". Past the cap the
 * query switches to an !inner embed and matches the learner in-database
 * instead. Same cap and same reasoning as the sibling bill list
 * (lib/services/billing/schedule/student-bill-service.ts).
 */
const MAX_INLINE_STUDENT_IDS = 150;

/**
 * The learner columns a receipt search may land on. Shared by both search
 * modes below so the inline-id path and the !inner fallback stay in step.
 *
 * `term` must already have been through sanitizeSearch() — it is interpolated
 * straight into PostgREST's `or=(...)` grammar, where `,` separates conditions,
 * `(`/`)` group and `.` separates column.operator.value.
 */
export function buildLearnerSearchOr(term: string): string {
  return [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `roll_number.ilike.%${term}%`
  ].join(',');
}

/**
 * The receipt-level search predicate: receipt number OR payer OR "belongs to
 * one of these learners".
 *
 * PostgREST cannot put an embedded resource's column inside a TOP-LEVEL
 * `or=(...)` — `or=(receipt_number.ilike.*x*,student.first_name.ilike.*x*)` is
 * rejected outright with PGRST100 "failed to parse logic tree", with or without
 * an !inner embed (verified against this project's live REST API). Scoping the
 * or to the embed instead (`referencedTable: 'student'`) would AND it with the
 * parent predicate rather than OR-ing, which is the wrong question. So the
 * learner half is resolved to ids first and OR'd in as a plain parent-column
 * filter, which keeps the search one flat OR over billing_receipts.
 */
export function buildReceiptSearchOr(
  term: string,
  studentIds: readonly string[]
): string {
  const parts = [
    `receipt_number.ilike.%${term}%`,
    `payer_name.ilike.%${term}%`
  ];
  if (studentIds.length > 0) {
    parts.push(`student_id.in.(${studentIds.join(',')})`);
  }
  return parts.join(',');
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

  // Resolve the search BEFORE the select string is built: the overflow branch
  // needs the learner embed to be !inner, and the select is a compile-time
  // string. The term is sanitised with the repo's own sanitizeSearch (it strips
  // % \ ' " ( ) , . * ) because it is interpolated raw into PostgREST's filter
  // grammar — a comma or parenthesis in the box would otherwise inject a
  // sibling condition. A term made entirely of punctuation sanitises to '' and
  // is treated as no search at all, rather than as an everything-matches ilike.
  const searchTerm = filters.search ? sanitizeSearch(filters.search) : '';
  let searchStudentIds: string[] = [];
  let searchViaJoin = false;

  if (searchTerm) {
    const { data: matchedLearners, error: learnerLookupError } = await supabase
      .from('learners_profiles')
      .select('id')
      .or(buildLearnerSearchOr(searchTerm))
      // One past the cap is all we need to know the list overflows.
      .limit(MAX_INLINE_STUDENT_IDS + 1);

    if (learnerLookupError) {
      throw new Error(
        `Failed to resolve receipt search: ${learnerLookupError.message}`
      );
    }

    const ids = (matchedLearners ?? []).map((s: { id: string }) => s.id);
    if (ids.length > MAX_INLINE_STUDENT_IDS) {
      searchViaJoin = true;
    } else {
      searchStudentIds = ids;
    }
  }

  // !inner is applied ONLY on the overflow search branch. It changes the join
  // semantics — receipts whose learner row is missing or invisible under RLS
  // are dropped — so the unfiltered list, and every search small enough to
  // resolve inline, keep the existing LEFT-join shape.
  const studentEmbed = searchViaJoin
    ? 'learners_profiles!inner'
    : 'learners_profiles';

  let query = supabase.from('billing_receipts').select(
    `
      *,
      student:${studentEmbed}(
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

  // Apply the search resolved above.
  if (searchTerm) {
    if (searchViaJoin) {
      // Term too broad to inline: match the learner in-database through the
      // !inner embed. receipt_number/payer_name are NOT OR'd in on this branch
      // — PostgREST cannot span the join inside one `or` — but a term matching
      // >150 learners is a name fragment, so the name match dominates anyway.
      query = query.or(buildLearnerSearchOr(searchTerm), {
        referencedTable: 'student'
      });
    } else {
      query = query.or(buildReceiptSearchOr(searchTerm, searchStudentIds));
    }
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
  // (learners_profiles) relation.
  //
  // The `referencedTable: 'student'` form used here previously emits
  // `student.order=first_name.asc`, which orders rows WITHIN the embedded
  // resource. `student` is a to-one embed holding exactly one row, so that sort
  // was a silent no-op and the "Student Name" option did nothing.
  //
  // PostgREST's spread form `order=student(first_name).asc` orders the PARENT
  // rows by the embedded column, which is what the option promises. Verified
  // against this project's live REST API: it works on the plain (LEFT-join)
  // embed too, so it needs no !inner and does not change which receipts appear
  // or the exact count.
  const sortBy = filters.sortBy || 'receipt_date';
  const sortDirection = filters.sortDirection || 'desc';
  const ascending = sortDirection === 'asc';
  if (sortBy === 'student_name') {
    query = query
      .order('student(first_name)', { ascending })
      .order('student(last_name)', { ascending });
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
