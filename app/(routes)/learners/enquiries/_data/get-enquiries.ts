/**
 * Server-side data fetching for Enquiries
 *
 * This is a cached server function that fetches enquiry data.
 * Used by the server component to pre-render data on the server.
 */



import { createClient } from '@/lib/supabase/server';


import type { LearnerProfile } from '@/types/learner-profile';

/**
 * Virtual lifecycle_status sentinel handled by getEnquiries: expands to
 * lifecycle_status='enquiry' AND legacy_fee_mode=true and annotates each row
 * with resolution_status / missing_fields from
 * vw_learners_profile_fee_backfill_status so the "Fees Setup Pending" tab can
 * render badges.
 *
 * 2026-05-20: Updated from 'admitted' to 'enquiry' as part of the workflow
 * realignment. The 554 legacy_fee_mode rows that used to sit at 'admitted' were
 * migrated to 'enquiry' in 20260520120100_realign_lifecycle_statuses_data_and_seed.
 */
export const FEES_SETUP_PENDING = 'fees_setup_pending';

/**
 * Per-row fee-backfill annotations merged onto rows when fetched for the
 * "Fees Setup Pending" tab. Columns key off these to render badges.
 */
export type FeeBackfillAnnotations = {
  _resolution_status?:
    | 'tier1_ready'
    | 'tier2_ready'
    | 'missing_fields'
    | 'no_structure'
    | 'ambiguous_strict'
    | 'ambiguous_relaxed'
    | 'unclassified';
  _missing_fields?: string[];
  _matched_structure_id?: string | null;
};

export type EnrichedLearnerProfile = LearnerProfile & FeeBackfillAnnotations;

interface GetEnquiriesParams {
  page?: number;
  limit?: number;
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  // 2026-05-21: programme/semester/section/academic-year were dropped silently
  // because the page.tsx → getEnquiries handoff only forwarded the top-3 FK
  // filters. Users filtering by a specific programme variant (e.g. BSc CS
  // Cyber Security) saw all department leads, indistinguishable from leads
  // on the base programme. URL params already exist (see data-table-schema.ts),
  // we just need the service to honour them.
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  // URL param is `academic_year_id` but the FK column on learners_profiles
  // is `admission_year_id` — translate at the page→service boundary.
  admission_year_id?: string;
  lifecycle_status?: string;
  // 2026-06-17: Group Dashboard drill-down scope. The dashboard appends the
  // selected admission YEAR (integer, e.g. 2026) + the scoped institution id
  // list (plural). These mirror the year + institution scope the dashboard RPC
  // applies, so the enquiries list total matches the KPI card the user clicked.
  // `admission_year` (int) expands to the matching admission_year UUIDs.
  admission_year?: number;
  institution_ids?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface GetEnquiriesResult {
  data: EnrichedLearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/**
 * Get enquiries with server-side caching
 *
 * Cache Strategy: WARM (5 minutes TTL)
 * - Enquiry data changes moderately
 * - Cache tags allow targeted invalidation
 */
export async function getEnquiries(
  params: GetEnquiriesParams = {}
): Promise<GetEnquiriesResult> {
  try {
    return await getEnquiriesInner(params);
  } catch (err) {
    console.error('[getEnquiries] Unexpected failure, returning empty result:', err);
    return {
      data: [],
      metadata: {
        total_items: 0,
        page: params.page || 1,
        limit: params.limit || 10,
        total_pages: 0
      }
    };
  }
}

async function getEnquiriesInner(
  params: GetEnquiriesParams
): Promise<GetEnquiriesResult> {
  const supabase = await createClient();

  const {
    page = 1,
    limit = 10,
    search,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    admission_year_id,
    lifecycle_status,
    admission_year,
    institution_ids,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = params;

  // Build query - filter for enquiry and pending statuses
  let query = supabase
    .from('learners_profiles')
    .select(
      `
      *,
      institution:institutions(id, name, counselling_code),
      degree:degrees(id, degree_name, degree_id),
      department:departments(id, department_name),
      program:programs(id, program_name),
      semester:semesters(id, semester_name, semester_code),
      section:sections(id, section_name),
      admission_year_obj:admission_years!admission_year_id(id, admission_year_name, year)
    `,
      { count: 'exact' }
    );

  // Filter for enquiry statuses.
  // The 'fees_setup_pending' sentinel is a virtual tab: expand to enquiry+legacy.
  // 2026-05-20: Default lifecycle list now includes 'enquiry', 'enquiry_submitted'.
  // Avoids the May 2026 regression where the default filter dropped 'enquiry'.
  const isFeesSetupPending = lifecycle_status === FEES_SETUP_PENDING;
  const isAllStatuses = lifecycle_status === 'all';
  if (isFeesSetupPending) {
    query = query.eq('lifecycle_status', 'enquiry').eq('legacy_fee_mode', true);
  } else if (isAllStatuses) {
    // Search across all admission lifecycle stages EXCEPT 'active' —
    // active students are managed in the Profiles page, not Enquiries.
    query = query.neq('lifecycle_status', 'active');
  } else if (lifecycle_status) {
    query = query.eq('lifecycle_status', lifecycle_status);
  } else {
    query = query.in('lifecycle_status', ['enquiry', 'enquiry_submitted', 'pending']);
  }

  // Apply filters - Parse advanced search format
  if (search) {
    // Check if this is the new advanced search format: "name:John|roll:123|email:test@example.com"
    if (search.includes('|') || search.includes(':')) {
      // Parse the search format
      const searchParts = search.split('|');
      const searchConditions: string[] = [];

      searchParts.forEach(part => {
        const [field, value] = part.split(':');
        if (!field || !value) return;

        const trimmedValue = value.trim();
        if (!trimmedValue) return;

        // Map field names to database columns
        if (field === 'name') {
          // Search in both first_name and last_name
          searchConditions.push(`first_name.ilike.%${trimmedValue}%`);
          searchConditions.push(`last_name.ilike.%${trimmedValue}%`);
        } else if (field === 'roll') {
          searchConditions.push(`roll_number.ilike.%${trimmedValue}%`);
        } else if (field === 'email') {
          searchConditions.push(`student_email.ilike.%${trimmedValue}%`);
          searchConditions.push(`college_email.ilike.%${trimmedValue}%`);
        }
      });

      // Apply the OR conditions if we have any
      if (searchConditions.length > 0) {
        query = query.or(searchConditions.join(','));
      }
    } else {
      // Fallback to old search format (search all fields)
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,application_id.ilike.%${search}%,student_email.ilike.%${search}%,student_mobile.ilike.%${search}%`
      );
    }
  }

  if (institution_id) {
    query = query.eq('institution_id', institution_id);
  }

  if (degree_id) {
    query = query.eq('degree_id', degree_id);
  }

  if (department_id) {
    query = query.eq('department_id', department_id);
  }

  if (program_id) {
    query = query.eq('program_id', program_id);
  }

  if (semester_id) {
    query = query.eq('semester_id', semester_id);
  }

  if (section_id) {
    query = query.eq('section_id', section_id);
  }

  if (admission_year_id) {
    query = query.eq('admission_year_id', admission_year_id);
  }

  // 2026-06-17: Group Dashboard drill-down scope. `admission_year` is the
  // integer cohort year; expand it to the matching admission_year UUIDs
  // (admission_year is per-institution) so the filtered total matches the
  // dashboard's year-scoped KPI card. An empty id list yields no rows, which
  // is correct — there is no cohort for that year. On lookup error we fail
  // open (skip the filter) rather than crash the list.
  if (admission_year != null && Number.isFinite(admission_year)) {
    const { data: ayRows, error: ayErr } = await supabase
      .from('admission_years')
      .select('id')
      .eq('year', admission_year);
    if (ayErr) {
      console.error('[getEnquiries] Failed to resolve admission years for scope:', ayErr);
    } else {
      query = query.in(
        'admission_year_id',
        (ayRows ?? []).map((r: { id: string }) => r.id)
      );
    }
  }

  if (institution_ids && institution_ids.length > 0) {
    query = query.in('institution_id', institution_ids);
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Execute the main query. PostgREST returns the exact filtered total in
  // `count` because we passed `{ count: 'exact' }` on the .select() above —
  // there is no need for a second `countQuery` here. Dropping the redundant
  // round-trip cuts per-tab database calls in half. (2026-05-20)
  const { data, error, count } = await query.range(from, to);

  // Never throw from a Server Component data fetcher — the error bubbles up
  // to the root error boundary and crashes the entire page (all tabs).
  // Log and return empty result so the tab renders "No data" instead.
  if (error) {
    if (error.code === 'PGRST103') {
      console.warn('[getEnquiries] Pagination range exceeds available rows, returning empty result');
    } else {
      // Supabase errors are plain objects, not Error instances — log every
      // diagnostic field explicitly so console.error doesn't render '{}'.
      console.error('[getEnquiries] Error fetching enquiries:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        statusFilter: lifecycle_status,
      });
    }
    return {
      data: [],
      metadata: { total_items: 0, page, limit, total_pages: 0 }
    };
  }

  const totalPages = count ? Math.ceil(count / limit) : 0;

  let enriched: EnrichedLearnerProfile[] = (data as EnrichedLearnerProfile[]) || [];

  // For the "Fees Setup Pending" tab, annotate each row with the view's
  // resolution_status + missing_fields so columns can render badges. Done
  // as a second query so we don't reshape the existing main-table query.
  if (isFeesSetupPending && enriched.length > 0) {
    const ids = enriched.map(r => r.id);
    const { data: statusRows, error: statusError } = await supabase
      .from('vw_learners_profile_fee_backfill_status')
      .select('learner_id, resolution_status, missing_fields, matched_structure_id')
      .in('learner_id', ids);

    if (statusError) {
      console.error('[getEnquiries] Error fetching fee-backfill status:', statusError);
      // Fail open: rows still render, just without badges.
    } else if (statusRows) {
      const byId = new Map<string, {
        resolution_status: string;
        missing_fields: string[] | null;
        matched_structure_id: string | null;
      }>();
      for (const r of statusRows as any[]) {
        byId.set(r.learner_id, {
          resolution_status: r.resolution_status,
          missing_fields: r.missing_fields ?? null,
          matched_structure_id: r.matched_structure_id ?? null,
        });
      }
      enriched = enriched.map(row => {
        const s = byId.get(row.id);
        if (!s) return row;
        return {
          ...row,
          _resolution_status: s.resolution_status as FeeBackfillAnnotations['_resolution_status'],
          _missing_fields: s.missing_fields ?? undefined,
          _matched_structure_id: s.matched_structure_id ?? undefined,
        };
      });
    }
  }

  return {
    data: enriched,
    metadata: {
      total_items: count || 0,
      page,
      limit,
      total_pages: totalPages
    }
  };
}
