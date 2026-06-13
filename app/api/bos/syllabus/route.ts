import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveBosAccess,
  resolveBosBoardScope,
  compositionScopeFilter,
  applyInstitutionScope,
  guardInstitutionWrite,
  resolveCoeInstitutionId,
} from '@/lib/utils/bos/bos-access';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import { BosCourseSyllabus, BosSyllabusListResponse, CreateBosSyllabusDto } from '@/types/bos';

// Sort syllabi by course_mapping.course_order (asc, nulls last) with course_code
// tiebreak. Mirrors the rule in app/(routes)/bos/course-scheme/_components/
// scheme-page-client.tsx so the syllabus list matches the scheme PDF order.
function sortByCourseOrder(
  rows: BosCourseSyllabus[],
  courseOrderByCode: Map<string, number>,
): BosCourseSyllabus[] {
  return [...rows].sort((a, b) => {
    const ao = courseOrderByCode.get(a.course_code) ?? Number.MAX_SAFE_INTEGER;
    const bo = courseOrderByCode.get(b.course_code) ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.course_code ?? '').localeCompare(b.course_code ?? '');
  });
}

/**
 * GET /api/bos/syllabus
 *
 * Fetch all syllabi for the authenticated user's institution.
 * Supports filtering by board, regulation, course code, stream, version status.
 * Returns paginated results (default 50 per page).
 *
 * Query parameters:
 * - institutionsId (override for super admin)
 * - boardId
 * - regulationId
 * - courseCode
 * - stream (e.g., "Engineering", "Pharmacy")
 * - isLatest (true/false, default: true)
 * - isArchived (true/false, default: false)
 * - search (searches course_code, course_name)
 * - page (default: 1)
 * - limit (default: 50)
 * - sortBy (default: "course_code")
 * - sortOrder (asc/desc, default: asc)
 */
export async function GET(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution + board-membership scope.
    // Syllabi have board_id but no composition_id, so members are filtered by
    // boardsOf (the union of board_ids across their active compositions).
    const scope = await resolveBosBoardScope(user.id);
    const scopeFilter = compositionScopeFilter(scope);

    if (scopeFilter.kind === 'none') {
      return NextResponse.json({
        data: [],
        metadata: { total: 0, page: 1, limit: 50, totalPages: 0 },
      } as BosSyllabusListResponse);
    }

    // Step 3: Parse query parameters
    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId') || undefined;
    const boardId = searchParams.get('boardId') || undefined;
    const regulationId = searchParams.get('regulationId') || undefined;
    const courseCode = searchParams.get('courseCode') || undefined;
    const stream = searchParams.get('stream') || undefined;
    const isLatest = searchParams.get('isLatest') !== 'false';
    const isArchived = searchParams.get('isArchived') === 'true';
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const sortBy = searchParams.get('sortBy') || 'course_code';
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc';

    // Step 4: Apply institution scope.
    // Super-admin with no institutionsId = "All institutions" cross-institution view — allowed.
    // Non-admin without an institution association = still rejected (403).
    const scopedInstitutionsId = applyInstitutionScope(scope, institutionsId);

    if (!scopedInstitutionsId && !scope.isSuperAdmin) {
      return NextResponse.json(
        {
          error: 'Your account is not associated with an institution. Contact your administrator to assign an institution to your profile.'
        },
        { status: 403 }
      );
    }

    // Step 5: Build query — CAS-aware: use allInstitutionIds (Aided + Self) when available.
    // Super-admin has allInstitutionIds=[] and may omit institutionsId → no institution filter
    // (fan-out across every institution). Single scopedInstitutionsId is used otherwise.
    const filterIds: string[] = scope.allInstitutionIds.length > 0
      ? scope.allInstitutionIds
      : scopedInstitutionsId
        ? [scopedInstitutionsId]
        : [];

    let query = supabase
      .from('bos_course_syllabi')
      .select('*', { count: 'exact' });

    if (filterIds.length > 1) {
      query = query.in('institutions_id', filterIds);
    } else if (filterIds.length === 1) {
      query = query.eq('institutions_id', filterIds[0]);
    }
    // filterIds.length === 0 → super-admin "All institutions" — no institution filter

    // Board-membership scope (after the institution filter).
    //  - 'all'           : super-admin — no extra filter
    //  - 'byInstitution' : principal — institution filter above is sufficient
    //  - 'byComposition' : member/chairman — restrict by board_id ∈ boardsOf.
    //                      (Schema has board_id, no composition_id; we use the
    //                      board set derived during scope resolution.)
    if (scopeFilter.kind === 'byComposition') {
      const boardIds = Array.from(scope.boardsOf);
      if (boardIds.length === 0) {
        return NextResponse.json({
          data: [],
          metadata: { total: 0, page, limit, totalPages: 0 },
        } as BosSyllabusListResponse);
      }
      query = query.in('board_id', boardIds);
    }

    // Apply filters
    if (boardId) query = query.eq('board_id', boardId);
    if (regulationId) query = query.eq('regulation_id', regulationId);
    if (courseCode) query = query.eq('course_code', courseCode);
    if (stream) query = query.eq('stream', stream);
    if (isLatest) query = query.eq('is_latest', true);
    if (isArchived !== undefined) query = query.eq('is_archived', isArchived);

    // Search filter
    if (search) {
      query = query.or(
        `course_code.ilike.%${search}%,course_name.ilike.%${search}%`
      );
    }

    // Step 6: Sort + paginate.
    //
    // When regulationId is set, sort by course_mapping.course_order (asc, nulls
    // last, course_code tiebreak) to match the scheme PDF order. course_order
    // lives in COE's course_mapping table — a different database — so we fetch
    // all matching rows (bounded by `limit`), enrich client-side, sort, then
    // slice for pagination. If the COE enrichment fails (network, missing
    // mapping, etc.), we fall back silently to the DB-side course_code sort
    // and DB-side pagination so the page still renders.
    let response: BosSyllabusListResponse;

    if (regulationId) {
      // Enrichment cap matches DB row cap on the path below — bounded fan-out.
      const enrichmentCap = Math.max(limit, 500);
      const { data: allData, count, error } = await query
        .order('course_code', { ascending: true })
        .range(0, enrichmentCap - 1);

      if (error) {
        console.error('[GET /api/bos/syllabus] Query error:', error);
        return NextResponse.json({ error: 'Failed to fetch syllabi' }, { status: 500 });
      }

      const allRows = (allData as BosCourseSyllabus[]) || [];

      // Look up regulation_code (string) from regulation_id (uuid). Needed for
      // the COE course-mapping API which keys by code, not id.
      const { data: regRow } = await supabase
        .from('regulations')
        .select('regulation_code')
        .eq('id', regulationId)
        .maybeSingle();
      const regulationCode = regRow?.regulation_code as string | undefined;

      // Pick a COE institution id. Prefer the scoped one (single-institution
      // request); otherwise fall back to the first row's institutions_id so
      // super-admin "All institutions" still gets a usable mapping.
      const sourceInstId = scopedInstitutionsId ?? allRows[0]?.institutions_id;

      const courseOrderByCode = new Map<string, number>();
      if (regulationCode && sourceInstId) {
        try {
          const coeInstId = await resolveCoeInstitutionId(sourceInstId);
          if (coeInstId) {
            const client = CoeRestClient.create();
            const mappingRes = await client.get<{ data?: Array<{ course_code?: string; course_order?: number | null }> }>(
              '/api/v1/course-mapping',
              {
                institutions_id: coeInstId,
                regulation_code: regulationCode,
                is_active: 'true',
                details: 'false',
                limit: '500',
              },
            );
            const mappings = mappingRes?.data ?? [];
            // Same course can be mapped under multiple programs with different
            // course_orders — keep the min so the syllabus row settles at the
            // earliest reasonable position.
            for (const m of mappings) {
              if (!m.course_code || m.course_order == null) continue;
              const prev = courseOrderByCode.get(m.course_code);
              if (prev === undefined || m.course_order < prev) {
                courseOrderByCode.set(m.course_code, m.course_order);
              }
            }
          }
        } catch (e) {
          // Enrichment is best-effort — log and fall through to course_code sort.
          console.warn('[GET /api/bos/syllabus] course_order enrichment failed:', e);
        }
      }

      const sorted = courseOrderByCode.size > 0
        ? sortByCourseOrder(allRows, courseOrderByCode)
        : allRows;

      const total = count ?? sorted.length;
      const offset = (page - 1) * limit;
      const pageRows = sorted.slice(offset, offset + limit);

      response = {
        data: pageRows,
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } else {
      // No regulation filter — fall back to DB-side sort + range pagination.
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        console.error('[GET /api/bos/syllabus] Query error:', error);
        return NextResponse.json({ error: 'Failed to fetch syllabi' }, { status: 500 });
      }

      response = {
        data: (data as BosCourseSyllabus[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/bos/syllabus] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bos/syllabus
 *
 * Create a new syllabus (draft version).
 * Only authenticated users can create.
 * Designer creates their own syllabi; Chairman can create for any course.
 *
 * Body:
 * {
 *   institutions_id: UUID,
 *   board_id: UUID,
 *   regulation_id: UUID,
 *   course_code: string,
 *   course_name: string,
 *   course_credits?: number,
 *   stream?: string,
 *   course_objectives?: JSONB,
 *   course_learning_outcomes?: JSONB,
 *   course_content?: JSONB,
 *   textbooks?: JSONB,
 *   web_resources?: JSONB,
 *   pedagogy?: JSONB,
 *   po_mappings?: JSONB,
 *   notes?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse request body
    const body = (await request.json()) as CreateBosSyllabusDto;

    // Step 4: Validate required fields
    if (!body.course_code || !body.course_name || !body.institutions_id) {
      return NextResponse.json(
        { error: 'Missing required fields: course_code, course_name, institutions_id' },
        { status: 400 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, body.institutions_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Check for duplicate course code + regulation
    if (body.regulation_id) {
      const { data: existing } = await supabase
        .from('bos_course_syllabi')
        .select('id')
        .eq('regulation_id', body.regulation_id)
        .eq('course_code', body.course_code)
        .eq('is_latest', true)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: `Course ${body.course_code} already exists in this regulation. Use revise endpoint to create a new version.` },
          { status: 409 }
        );
      }
    }

    // Step 7: Insert new syllabus (draft version)
    const { data: newSyllabus, error: insertError } = await supabase
      .from('bos_course_syllabi')
      .insert({
        ...body,
        board_id: body.board_id || null, // Allow null if not provided
        created_by: user.id,
        version_number: 1,
        is_latest: true,
        is_archived: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/bos/syllabus] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create syllabus' },
        { status: 500 }
      );
    }

    return NextResponse.json(newSyllabus, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/syllabus] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
