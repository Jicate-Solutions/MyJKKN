export const dynamic = 'force-dynamic';

// ============================================
// INCOMPLETE PROFILES API
// ============================================
// Created: 2026-02-09
// Updated: 2026-07-30 - Server-side pagination/search/sort + field filters so
//          the Profile Completion drill-down can use the shared DataTable.
// Updated: 2026-08-20 - Scoped to the onboarding-corridor lifecycle statuses
//          (account / reserved / admitted / active); gender added to the
//          required fields.
// Purpose: Fetch detailed learner profiles with missing-field info
// Used by: Profile Completion Tab drill-down table
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeSearch } from '@/lib/config/pagination';
import { resolveInstitutionScope } from '@/lib/auth/institution-scope';
import {
  PROFILE_COMPLETION_LIFECYCLE_STATUSES,
  PROFILE_FIELD_MISSING,
  type IncompleteProfileDetail,
  type ProfileCompletionScope,
} from '@/types/learner-dashboard';

/**
 * The fields that decide whether a learner profile counts as "complete".
 * Kept in one place because the row-level `missingFields` badges, the
 * `completion` scope filter and the exact DB count must all agree — when they
 * were derived independently the table's footer count disagreed with its rows.
 *
 * NOTE: admission year is deliberately NOT here. It is filterable and shown as
 * a column, but it has never been part of the completion definition.
 *
 * The funnel/tier cards above this table come from a different endpoint
 * (/api/learners/analytics/stats) and still count only the first four, so this
 * table reports slightly more incomplete learners than the funnel does — the
 * seven whose only gap is gender. That is stated in the card description; move
 * gender into the stats endpoint too if the two must agree exactly.
 */
const REQUIRED_FIELDS = [
  { column: 'college_email', label: 'College Email' },
  { column: 'academic_year_id', label: 'Academic Year' },
  { column: 'semester_id', label: 'Semester' },
  { column: 'section_id', label: 'Section' },
  // 2026-08-20. `blankIsMissing` exists because gender is free text where the
  // four above are a uuid or an email: production holds ZERO null genders and
  // twelve empty strings, so an `IS NULL`-only predicate would be a filter
  // that can never match a single row. Every predicate built from this table
  // therefore carries a `= ''` arm for flagged columns.
  { column: 'gender', label: 'Gender', blankIsMissing: true },
] as const;

/** PostgREST `or=` terms that mean "this required field is not filled in". */
function missingTerms(field: (typeof REQUIRED_FIELDS)[number]): string[] {
  const terms = [`${field.column}.is.null`];
  // `eq.` with no value is PostgREST for `= ''`.
  if ('blankIsMissing' in field && field.blankIsMissing) {
    terms.push(`${field.column}.eq.`);
  }
  return terms;
}

/** Narrow a query to rows where `column` is unset — NULL, or blank if free text. */
function whereMissing(query: any, column: string): any {
  const field = REQUIRED_FIELDS.find((f) => f.column === column);
  return field ? query.or(missingTerms(field).join(',')) : query.is(column, null);
}

/**
 * Columns the `missingField` filter may target. A superset of REQUIRED_FIELDS:
 * admission year is answerable ("who has no admission year?") without being
 * part of the completeness definition, so it belongs here and NOT above —
 * adding it to REQUIRED_FIELDS would reclassify ~2,100 otherwise-complete
 * profiles as incomplete and shift every count on the tab.
 */
const FILTERABLE_MISSING_FIELDS = new Set<string>([
  ...REQUIRED_FIELDS.map((f) => f.column),
  'admission_year_id',
]);

/**
 * Columns the client is allowed to sort by. The DataTable sends `sort_by`
 * straight from column ids, so an allowlist keeps an unknown/renamed column
 * from reaching PostgREST as a 400.
 */
const SORTABLE_COLUMNS = new Set([
  'created_at',
  'first_name',
  'last_name',
  'college_email',
  'roll_number',
  'application_id',
  'lifecycle_status',
  'is_profile_complete',
]);

/** Query-param value -> `.eq(col, value)` or `.is(col, null)`. */
function applyIdFilter(
  query: any,
  column: string,
  value: string | null
): any {
  if (!value) return query;
  if (value === PROFILE_FIELD_MISSING) return query.is(column, null);
  return query.eq(column, value);
}

/**
 * GET /api/learners/analytics/incomplete-profiles
 *
 * Returns a page of learner profiles with which required fields are missing,
 * restricted to the onboarding corridor (see
 * PROFILE_COMPLETION_LIFECYCLE_STATUSES) — this endpoint never reports on
 * enquiries, rejected applicants or learners who have already left.
 *
 * Query Parameters:
 * - institutionIds : comma-separated institution IDs
 * - page           : 1-based page number (default 1)
 * - limit          : rows per page (default 50, max 200)
 * - search         : matches name / college email / roll no / application id
 * - sortBy         : one of SORTABLE_COLUMNS (default created_at)
 * - sortOrder      : asc | desc (default desc)
 * - completion     : incomplete (default) | complete | all
 * - missingField   : college_email | academic_year_id | admission_year_id
 *                    | semester_id | section_id | gender
 * - collegeEmail   : missing | present
 * - academicYearId : UUID or "MISSING"
 * - admissionYearId: UUID or "MISSING"
 * - departmentId   : UUID or "MISSING"
 * - programId      : UUID or "MISSING"
 * - semesterId     : UUID or "MISSING"
 * - sectionId      : UUID or "MISSING"
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // ── Pagination ────────────────────────────────────────────────────────
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, Number.isNaN(limitParam) ? 50 : limitParam), 200);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const page = Math.max(1, Number.isNaN(pageParam) ? 1 : pageParam);
    const offset = (page - 1) * limit;

    // ── Sorting ───────────────────────────────────────────────────────────
    const sortByParam = searchParams.get('sortBy') || 'created_at';
    const sortBy = SORTABLE_COLUMNS.has(sortByParam) ? sortByParam : 'created_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // ── Base query ────────────────────────────────────────────────────────
    let query = supabase
      .from('learners_profiles')
      .select(
        `
        id,
        first_name,
        last_name,
        college_email,
        gender,
        lifecycle_status,
        roll_number,
        application_id,
        created_at,
        is_profile_complete,
        academic_year_id,
        admission_year_id,
        semester_id,
        section_id,
        program:programs(id, program_name),
        semester:semesters(id, semester_name),
        section:sections(id, section_name),
        academic_year:academic_years(id, academic_year_name),
        admission_year:admission_years(id, admission_year_name)
      `,
        { count: 'exact' }
      );

    // ── Lifecycle scope ───────────────────────────────────────────────────
    //
    // Applied server-side, before every other filter, so the exact `count`,
    // each page of rows and the Export file all describe the same population.
    // Filtering these out in JS after the fact would make `total` a lie the
    // moment a page contained an out-of-scope row.
    query = query.in('lifecycle_status', PROFILE_COMPLETION_LIFECYCLE_STATUSES);

    // ── Completion scope ──────────────────────────────────────────────────
    //
    // Derived from the REQUIRED_FIELDS themselves rather than the stored
    // `is_profile_complete` flag. The flag goes stale (it is maintained by
    // application code, not a constraint), and the previous implementation
    // papered over that by fetching flag=false rows and dropping the stale
    // ones in JS — which silently made the reported total a per-page count.
    // Deriving in SQL keeps `count: 'exact'` honest across every page.
    const completion = (searchParams.get('completion') ||
      'incomplete') as ProfileCompletionScope;

    if (completion === 'incomplete') {
      query = query.or(REQUIRED_FIELDS.flatMap(missingTerms).join(','));
    } else if (completion === 'complete') {
      for (const field of REQUIRED_FIELDS) {
        query = query.not(field.column, 'is', null);
        if ('blankIsMissing' in field && field.blankIsMissing) {
          query = query.neq(field.column, '');
        }
      }
    }
    // 'all' adds no constraint.

    // ── Missing-field filter ──────────────────────────────────────────────
    // "Show me only the learners missing <field>" — the Missing Fields column
    // turned into a filter. Allowlisted so an unknown value can never reach
    // PostgREST as a column name.
    const missingField = searchParams.get('missingField');
    if (missingField && FILTERABLE_MISSING_FIELDS.has(missingField)) {
      query = whereMissing(query, missingField);
    }

    // ── Field filters ─────────────────────────────────────────────────────
    const collegeEmail = searchParams.get('collegeEmail');
    if (collegeEmail === 'missing') {
      query = query.is('college_email', null);
    } else if (collegeEmail === 'present') {
      query = query.not('college_email', 'is', null);
    }

    query = applyIdFilter(query, 'academic_year_id', searchParams.get('academicYearId'));
    query = applyIdFilter(query, 'admission_year_id', searchParams.get('admissionYearId'));

    // Organisational hierarchy: institution > department > program > semester
    // > section. Each level is applied independently even though the UI
    // presents them as a cascade — the client only ever sends a consistent
    // combination, and applying them independently keeps "Not set" usable at
    // any level (e.g. a learner with a program but no semester).
    query = applyIdFilter(query, 'department_id', searchParams.get('departmentId'));
    query = applyIdFilter(query, 'program_id', searchParams.get('programId'));
    query = applyIdFilter(query, 'semester_id', searchParams.get('semesterId'));
    query = applyIdFilter(query, 'section_id', searchParams.get('sectionId'));

    // ── Search ────────────────────────────────────────────────────────────
    // A second `or=` param; PostgREST ANDs top-level params, so this narrows
    // the completion scope above rather than widening it.
    const rawSearch = searchParams.get('search') || '';
    const search = sanitizeSearch(rawSearch);
    if (search) {
      query = query.or(
        [
          `first_name.ilike.%${search}%`,
          `last_name.ilike.%${search}%`,
          `college_email.ilike.%${search}%`,
          `roll_number.ilike.%${search}%`,
          `application_id.ilike.%${search}%`,
        ].join(',')
      );
    }

    // ── Institution scope ─────────────────────────────────────────────────
    // An omitted `institutionIds` means "all institutions" from the client, so
    // it must NOT collapse to the caller's own institution for a super admin —
    // theirs points at their employer, not a college. See resolveInstitutionScope.
    const institutionIdsParam = searchParams.get('institutionIds');
    const institutionScope = resolveInstitutionScope(
      profile,
      institutionIdsParam ? institutionIdsParam.split(',').filter(Boolean) : null
    );
    if (institutionScope) {
      query = query.in('institution_id', institutionScope);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[api/learners/analytics/incomplete-profiles] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch incomplete profiles', details: error.message },
        { status: 500 }
      );
    }

    // Compute missing fields per profile and collect stale-flag candidates
    const staleIds: string[] = [];
    const profiles: IncompleteProfileDetail[] = (data || []).map((row: any) => {
      const missingFields: string[] = [];

      for (const field of REQUIRED_FIELDS) {
        if (!row[field.column]) missingFields.push(field.label);
      }

      // Detect stale is_profile_complete flag (all required fields present but
      // the flag says otherwise). Only reachable via the 'complete'/'all'
      // scopes now that 'incomplete' is derived from the fields themselves.
      if (missingFields.length === 0 && row.is_profile_complete !== true) {
        staleIds.push(row.id);
      }

      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        college_email: row.college_email,
        lifecycle_status: row.lifecycle_status,
        roll_number: row.roll_number,
        application_id: row.application_id,
        created_at: row.created_at,
        missingFields,
        missing_fields_label: missingFields.join(', '),
        program_name: row.program?.program_name ?? null,
        semester_name: row.semester?.semester_name ?? null,
        section_name: row.section?.section_name ?? null,
        academic_year_name: row.academic_year?.academic_year_name ?? null,
        admission_year_name: row.admission_year?.admission_year_name ?? null,
        is_profile_complete: missingFields.length === 0,
      };
    });

    // Auto-fix stale is_profile_complete flags in the background. Deliberately
    // one-directional (false -> true only): flipping true -> false from a read
    // path would be a new write behaviour on rows this endpoint only reports on.
    if (staleIds.length > 0) {
      supabase
        .from('learners_profiles')
        .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
        .in('id', staleIds)
        .then(({ error: fixError }) => {
          if (fixError) {
            console.error('[api/learners/analytics/incomplete-profiles] Error fixing stale flags:', fixError);
          } else {
            console.log(`[api/learners/analytics/incomplete-profiles] Auto-fixed ${staleIds.length} stale is_profile_complete flags`);
          }
        });
    }

    const total = count ?? 0;

    return NextResponse.json(
      {
        profiles,
        total,
        limit,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[api/learners/analytics/incomplete-profiles] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch incomplete profiles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
