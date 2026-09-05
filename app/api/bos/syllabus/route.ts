import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosAccess,
  resolveBosBoardScope,
  applyInstitutionScope,
  guardInstitutionWrite,
  resolveCoeInstitutionId,
  readableCounsellingCodes,
  hasBosPermission,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';
import { counsellingCodeFor } from '@/lib/utils/bos/institution-scope';
import {
  findCourseCodeConflict,
  courseCodeConflictMessage,
  courseCodeConflictMessageFor,
  UNIQUE_VIOLATION,
} from '@/lib/utils/bos/course-code-conflict';
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

    // Step 2: Resolve board-membership scope.
    // Policy (2026-07-23, reverses 2026-07-16): the read-all observer tier IS
    // applied — any holder of academic.bos-syllabus.view reads every board's
    // syllabi across ALL institutions, VIEW ONLY (edit stays gated by
    // guardSyllabusEdit on the mutating routes). Board-scoping now only
    // applies to users who reach this route WITHOUT the view grant.
    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasBosPermission(user.id, 'academic.bos-syllabus.view');
    const seeAll = scope.isSuperAdmin || isBosReadAllObserver(scope, hasView);
    const boardIds = Array.from(scope.boardsOf);

    if (!seeAll && boardIds.length === 0) {
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
    // Observer reads across all institutions, so an unscoped request is fine —
    // treat like super-admin for the "no institution" allowance.
    const scopedInstitutionsId = seeAll ? (institutionsId ?? null) : applyInstitutionScope(scope, institutionsId);

    if (!scopedInstitutionsId && !seeAll) {
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
    // CAS-aware institution filter via the denormalized counselling_code (one
    // value spans the Aided + SF pair):
    //  - non-admin: their own institution's code (readableCounsellingCodes).
    //  - super-admin scoped to a specific institution: that institution's code.
    //  - super-admin with no institution: no filter (all institutions).
    let filterCode: string | null = null;
    if (!seeAll) {
      const codes = await readableCounsellingCodes(scope);
      filterCode = codes && codes.length > 0 ? codes[0] : null;
    } else if (scopedInstitutionsId) {
      filterCode = await counsellingCodeFor(supabase, scopedInstitutionsId);
    }

    // Read via service-role, with the institution (counselling_code) + board_id
    // filters below AS the authorization — the route enforces board-scoping
    // explicitly (matching the PUT/DELETE + meetings/TA-DA precedent), so we
    // don't depend on the bos_course_syllabi SELECT RLS policy (which errors for
    // board members whose role can't read the tables its USING clause subqueries).
    const readDb = createServiceRoleClient();

    // Resolve the regulation filter to a CAS-sibling-aware set.
    // A CAS college has TWO institution rows (Aided + Self-Financed), each with
    // its OWN regulation row that shares the same regulation_code (e.g. two
    // "R-2024" rows). Syllabi may be authored under either sibling, so filtering
    // by the single passed regulation_id silently drops the other sibling's
    // syllabi (the exact bug behind "only one course downloads"). We expand the
    // filter to every active regulation_id sharing the code; the counselling_code
    // filter above still scopes results to the caller's institution(s).
    //
    // For a NON-CAS institution a code maps to exactly one regulation row, so
    // this resolves to [regulationId] and behaves identically to a plain .eq().
    let regulationIdsFilter: string[] | null = null;
    if (regulationId) {
      const { data: regRow } = await supabase
        .from('regulations')
        .select('regulation_code')
        .eq('id', regulationId)
        .maybeSingle();
      const code = regRow?.regulation_code as string | undefined;
      if (code) {
        const { data: siblingRegs } = await supabase
          .from('regulations')
          .select('id')
          .eq('regulation_code', code)
          .eq('is_active', true);
        const ids = (siblingRegs ?? []).map((r) => r.id as string);
        regulationIdsFilter = ids.length > 0 ? ids : [regulationId];
      } else {
        regulationIdsFilter = [regulationId];
      }
    }

    // Query FACTORY, not a single builder. A PostgrestFilterBuilder executes
    // (and is consumed) on await, so the drain loop below — which issues one
    // request per 1000-row chunk — needs a fresh, identically-filtered builder
    // each time. Every filter therefore lives here, in one place, so the chunked
    // reads and the paginated read below can never drift apart.
    const buildQuery = () => {
      let q = readDb
        .from('bos_course_syllabi')
        .select('*', { count: 'exact' });

      if (filterCode) {
        q = q.eq('counselling_code', filterCode);
      } else if (!seeAll) {
        // Non-admin whose code didn't resolve — never run unfiltered; fall back to
        // the single institution UUID so we still scope (and don't leak).
        q = q.eq('institutions_id', scopedInstitutionsId!);
      }
      // super-admin / read-all observer with no filterCode → "All institutions" (no institution filter)

      // Board-scoped visibility for EVERYONE except super-admin — members,
      // chairman AND principals see only the boards they sit on. boardIds was
      // resolved (and the empty case returned early) in Step 2.
      if (!seeAll) q = q.in('board_id', boardIds);

      if (boardId) q = q.eq('board_id', boardId);
      if (regulationIdsFilter) q = q.in('regulation_id', regulationIdsFilter);
      if (courseCode) q = q.eq('course_code', courseCode);
      if (stream) q = q.eq('stream', stream);
      if (isLatest) q = q.eq('is_latest', true);
      if (isArchived !== undefined) q = q.eq('is_archived', isArchived);

      // Search filter
      if (search) {
        q = q.or(`course_code.ilike.%${search}%,course_name.ilike.%${search}%`);
      }

      return q;
    };

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
      // Drain EVERY matching row, in chunks — do not cap at one window.
      //
      // The course_order sort below is a global reordering of the whole result
      // set, so a partial read can't be sliced correctly: rows outside the
      // window are simply absent, and `page=2` would slice past the end of a
      // short array and return []. That is precisely what broke the
      // /bos/course-scheme "Download Syllabi" ZIP — CAS R-2024 has 836 latest
      // syllabi, the old 500-row window cut everything sorting after
      // ~24UCYCP05, and the ZIP silently shipped a partial set (General Tamil,
      // General English and the Generic Electives went missing).
      //
      // CHUNK stays at PostgREST's default max-rows so no single request is
      // truncated server-side; HARD_CAP is a runaway guard, and hitting it is
      // logged rather than silently swallowed.
      const CHUNK = 1000;
      const HARD_CAP = 10000;
      const allRows: BosCourseSyllabus[] = [];
      let count: number | null = null;

      for (let from = 0; from < HARD_CAP; from += CHUNK) {
        const { data: chunkData, count: chunkCount, error } = await buildQuery()
          .order('course_code', { ascending: true })
          .range(from, from + CHUNK - 1);

        if (error) {
          console.error('[GET /api/bos/syllabus] Query error:', error);
          return NextResponse.json({ error: 'Failed to fetch syllabi' }, { status: 500 });
        }

        if (chunkCount != null) count = chunkCount;
        const rows = (chunkData as BosCourseSyllabus[]) || [];
        allRows.push(...rows);
        if (rows.length < CHUNK) break;
      }

      if (count != null && allRows.length < count) {
        console.warn(
          '[GET /api/bos/syllabus] HARD_CAP reached: read %d of %d rows (regulationId=%s) — results are incomplete',
          allRows.length, count, regulationId,
        );
      }

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
                // This enrichment fetch is institution+regulation scoped (no
                // program_code), so it spans every program — for a CAS college
                // that exceeds 500 and the dropped tail (UG, since COE sorts PG
                // first) loses its course_order, breaking syllabus list/PDF
                // ordering. COE's course-mapping endpoint ignores offset (it does
                // range(0, limit-1)), so we can't paginate — request its single-
                // call max (10000) instead.
                limit: '10000',
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
      const offset = (page - 1) * limit;
      const { data, count, error } = await buildQuery()
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1);
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

    // Step 6: Check for duplicate course code + regulation.
    // Every version of the code is checked, not just is_latest — a new row is
    // always version 1, so an archived or superseded row still blocks it. See
    // lib/utils/bos/course-code-conflict.ts for why the old is_latest-only
    // check produced a mute 500 instead of a refusal.
    if (body.regulation_id) {
      const conflict = await findCourseCodeConflict(body.regulation_id, body.course_code);

      if (conflict) {
        return NextResponse.json(
          { error: courseCodeConflictMessage(body.course_code, conflict) },
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
      // A unique violation here means a colliding row the pre-check could not
      // see (a race, or a row hidden from this caller). Report it as the same
      // actionable 409 rather than a mute 500.
      if (insertError.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: await courseCodeConflictMessageFor(body.regulation_id, body.course_code) },
          { status: 409 }
        );
      }
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
