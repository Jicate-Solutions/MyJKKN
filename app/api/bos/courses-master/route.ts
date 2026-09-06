// app/api/bos/courses-master/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  canAccessBos,
  resolveBosAccess,
  resolveBosBoardScope,
  resolveCoeInstitutionId,
  applyInstitutionScope,
  guardCourseInstitutionWrite,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';
import { resolveBosInstitutionScope } from '@/lib/utils/bos/institution-scope';
import { makeCourseFormSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
import type { AcademicModel } from '@/types/bos';
import type { BosCourseMaster, BosCourseListResponse } from '@/types/bos-courses';

/**
 * COE /api/v1/courses may return all courses without filtering by institutions_id.
 * This helper ensures we only surface courses that belong to the requested institution.
 */
function filterByInstitution(
  raw: unknown,
  coeInstitutionId: string,
): unknown {
  const keep = (c: BosCourseMaster) =>
    !c.institutions_id || c.institutions_id === coeInstitutionId;

  if (Array.isArray(raw)) {
    return (raw as BosCourseMaster[]).filter(keep);
  }
  const wrapped = raw as BosCourseListResponse;
  if (wrapped && Array.isArray(wrapped.data)) {
    return { ...wrapped, data: wrapped.data.filter(keep) };
  }
  return raw;
}

// ── GET /api/bos/courses-master ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve permission + board-aware scope in parallel. boardsOf +
    // institutionsOf together drive the fan-out for users who serve on
    // boards across multiple institutions.
    const [hasAccess, scope, boardScope] = await Promise.all([
      canAccessBos(user.id, 'academic.bos-courses', 'view'),
      resolveBosAccess(user.id),
      resolveBosBoardScope(user.id),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Read-only observer: a view-only role (no board membership, not principal)
    // holding academic.bos-courses.view browses courses across all institutions,
    // exactly like a super-admin's read path. hasAccess IS the view grant here.
    const canReadAllBos = isBosReadAllObserver(boardScope, hasAccess);
    const seeAll = scope.isSuperAdmin || canReadAllBos;

    const { searchParams } = new URL(request.url);
    const client = CoeRestClient.create();

    // ── Composition-scoped mode (syllabus form course picker) ─────────────────
    // When composition_id is supplied, return the courses that belong to THAT
    // composition's board — NOT the union of the caller's own board memberships.
    // Authorisation is institution-scoped (CAS-aware + cross-institution board
    // membership), matching the composition picker which is also institution-
    // scoped: a user may build a syllabus for any composition under one of their
    // institutions, even a board they don't personally sit on. (Create itself is
    // still gated by guardCourseInstitutionWrite on POST.)
    const compositionId = searchParams.get('composition_id');
    if (compositionId) {
      const { data: comp } = await supabase
        .from('bos_compositions')
        .select('id, institutions_id, board_id')
        .eq('id', compositionId)
        .maybeSingle();

      if (!comp?.institutions_id || !comp.board_id) {
        return NextResponse.json({ data: [] });
      }

      if (!scope.isSuperAdmin) {
        const allowed = new Set<string>([
          ...(scope.institutionsId ? [scope.institutionsId] : []),
          ...scope.allInstitutionIds,
          ...boardScope.institutionsOf,
        ]);
        if (!allowed.has(comp.institutions_id)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      // Multi-board: the syllabus form may request a SPECIFIC board of this
      // composition. Honour it only if it actually belongs to the composition
      // (junction or primary); otherwise fall back to the primary board.
      const requestedBoardId = searchParams.get('board_id');
      let targetBoardId = comp.board_id;
      if (requestedBoardId && requestedBoardId !== comp.board_id) {
        const { data: jb } = await supabase
          .from('bos_composition_boards')
          .select('board_id')
          .eq('composition_id', comp.id);
        const compBoardSet = new Set<string>([
          comp.board_id,
          ...((jb ?? []) as { board_id: string }[]).map((r) => r.board_id),
        ]);
        if (compBoardSet.has(requestedBoardId)) targetBoardId = requestedBoardId;
      }

      // COE course rows refer to the MyJKKN institutions_id, and a CAS college's
      // counselling_code / institution_code maps to MULTIPLE MyJKKN ids (Aided +
      // SF). So resolve the composition institution to its full MyJKKN sibling
      // set via the shared code, then query COE once PER MyJKKN id and merge.
      // (The COE institution id is added as an extra candidate so we don't
      // regress on deployments that key courses by the COE institution.)
      const sib = await resolveBosInstitutionScope(supabase, comp.institutions_id);
      const coeId = await resolveCoeInstitutionId(comp.institutions_id);
      const candidateIds = [...new Set([...sib.ids, ...(coeId ? [coeId] : [])])];

      // Resolve the composition's board_code (bos_compositions.board_id is a COE
      // board id) — try each candidate institution until the board is found.
      interface CoeBoard { id: string; board_code: string }
      let boardCodeRaw: string | null = null;
      for (const instId of candidateIds) {
        try {
          const coeBoardsRaw = await client.get<unknown>('/api/v1/boards', {
            institutions_id: instId,
            is_active: 'true',
          });
          const coeBoards: CoeBoard[] = Array.isArray(coeBoardsRaw)
            ? (coeBoardsRaw as CoeBoard[])
            : ((coeBoardsRaw as { data?: CoeBoard[] })?.data ?? []);
          const found = coeBoards.find((b) => b.id === targetBoardId)?.board_code ?? null;
          if (found) { boardCodeRaw = found; break; }
        } catch { /* try next candidate */ }
      }
      const boardCode = boardCodeRaw?.toUpperCase() ?? null;

      // COE keys /api/v1/courses by the COE institution id (querying by the
      // MyJKKN id returns nothing) and IGNORES board_code, returning a generic
      // page that can be entirely one board (e.g. PCA). This board's courses
      // (e.g. UCS) sit beyond that first page, so paginate the full course set
      // for this institution+regulation and filter by board_code locally.
      const coeInstId = coeId;
      if (!coeInstId) {
        return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
      }

      const PAGE = 200;
      const MAX_PAGES = 12; // safety cap — 2400 courses
      const collected: (BosCourseMaster & { board_code?: string })[] = [];
      for (let p = 0; p < MAX_PAGES; p++) {
        const raw = await client.get<unknown>('/api/v1/courses', {
          institutions_id: coeInstId,
          regulation_code: searchParams.get('regulation_code') ?? undefined,
          program_code:    searchParams.get('program_code') ?? undefined,
          is_active:       searchParams.get('is_active') ?? 'true',
          limit:           String(PAGE),
          offset:          String(p * PAGE),
        }).catch((err) => {
          console.error('[bos/courses-master] composition-scoped: courses page fetch failed', p, err);
          return null;
        });
        if (!raw) break;
        const institutionFiltered = filterByInstitution(raw, coeInstId);
        const rows: (BosCourseMaster & { board_code?: string })[] = Array.isArray(institutionFiltered)
          ? (institutionFiltered as (BosCourseMaster & { board_code?: string })[])
          : (((institutionFiltered as BosCourseListResponse)?.data as (BosCourseMaster & { board_code?: string })[]) ?? []);
        collected.push(...rows);
        if (rows.length < PAGE) break;
      }

      const boardFiltered = boardCode
        ? collected.filter((c) => (c.board_code ?? '').toUpperCase() === boardCode)
        : collected;

      // Dedupe by course_code.
      const byCode = new Map<string, BosCourseMaster & { board_code?: string }>();
      for (const c of boardFiltered) {
        if (c.course_code && !byCode.has(c.course_code)) byCode.set(c.course_code, c);
      }
      return NextResponse.json({ data: Array.from(byCode.values()) });
    }

    // ── Super-admin paths ────────────────────────────────────────────────────
    // Super-admins are not board-filtered. They may scope to one institution
    // via the institution_id query param, or omit it for an all-institutions
    // dump (the existing /api/v1/courses behaviour without institutions_id).
    if (seeAll) {
      // Observer has no institution of its own, so scope only when an explicit
      // institution_id is supplied; otherwise fall through to the all-institutions
      // browse. Super-admin keeps applyInstitutionScope (identity for them).
      const effectiveInstitutionId = scope.isSuperAdmin
        ? applyInstitutionScope(scope, searchParams.get('institution_id'))
        : (searchParams.get('institution_id') || null);
      if (!effectiveInstitutionId) {
        // "All Institutions" browse. Paginate the full catalog: COE sorts by
        // course_code so PG (24P*) precede UG (24U*); a single capped page is
        // entirely PG and the UG courses never appear in the default (no-search)
        // list. Generous cap for the cross-institution view; break when drained.
        const ALL_PAGE = 200;
        const ALL_MAX_PAGES = 25; // safety cap — 5000 courses
        const allRows: BosCourseMaster[] = [];
        for (let p = 0; p < ALL_MAX_PAGES; p++) {
          const raw = await client.get<unknown>('/api/v1/courses', {
            regulation_code: searchParams.get('regulation_code') ?? undefined,
            search:          searchParams.get('search') ?? undefined,
            is_active:       searchParams.get('is_active') ?? 'true',
            limit:           String(ALL_PAGE),
            offset:          String(p * ALL_PAGE),
          }).catch((err) => {
            console.error('[bos/courses-master] all-institutions courses page fetch failed', p, err);
            return null;
          });
          if (!raw) break;
          const rows: BosCourseMaster[] = Array.isArray(raw)
            ? (raw as BosCourseMaster[])
            : (((raw as BosCourseListResponse)?.data as BosCourseMaster[]) ?? []);
          allRows.push(...rows);
          if (rows.length < ALL_PAGE) break;
        }
        return NextResponse.json({ data: allRows });
      }
      const coeInstitutionId = await resolveCoeInstitutionId(effectiveInstitutionId);
      if (!coeInstitutionId) {
        return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
      }
      // Paginate: COE sorts by course_code, so PG (24P*) precede UG (24U*) and a
      // single capped page would drop the UG courses. Collect all pages.
      const SA_PAGE = 200;
      const SA_MAX_PAGES = 12; // safety cap — 2400 courses
      const saAll: BosCourseMaster[] = [];
      for (let p = 0; p < SA_MAX_PAGES; p++) {
        const raw = await client.get<unknown>('/api/v1/courses', {
          institutions_id: coeInstitutionId,
          regulation_code: searchParams.get('regulation_code') ?? undefined,
          program_code:    searchParams.get('program_code') ?? undefined,
          search:          searchParams.get('search') ?? undefined,
          is_active:       searchParams.get('is_active') ?? 'true',
          limit:           String(SA_PAGE),
          offset:          String(p * SA_PAGE),
        }).catch((err) => {
          console.error('[bos/courses-master] super-admin courses page fetch failed', p, err);
          return null;
        });
        if (!raw) break;
        const filtered = filterByInstitution(raw, coeInstitutionId);
        const rows: BosCourseMaster[] = Array.isArray(filtered)
          ? (filtered as BosCourseMaster[])
          : (((filtered as BosCourseListResponse)?.data as BosCourseMaster[]) ?? []);
        saAll.push(...rows);
        if (rows.length < SA_PAGE) break;
      }
      return NextResponse.json({ data: saAll });
    }

    // ── Non-super-admin path: fan-out across every institution where the
    // user has an active composition, then filter each result by the boards
    // that user belongs to.
    //
    // A faculty member on Board A (Institution X) AND Board B (Institution Y)
    // sees the union of courses tagged to A and B. Before this fan-out, the
    // route forced everything to scope.institutionsId (the user's profile
    // institution) and silently dropped courses from Y.
    //
    // The client-supplied institution_id is ignored for non-super-admins —
    // the page always defaults it to profile.institution_id, which would
    // collapse the union back to a single institution. The server is the
    // authority on which institutions the user can see (institutionsOf).
    let targetInstitutionIds: string[] = Array.from(boardScope.institutionsOf);

    // Back-compat: if the user has no compositions but still has a primary
    // institution (legacy access via role-permission), fall through with that
    // single institution so the empty-list rendering still has a code path.
    if (targetInstitutionIds.length === 0 && scope.institutionsId) {
      targetInstitutionIds = [scope.institutionsId];
    }

    // Empty boards or empty institutions → empty list. The board-membership
    // gate is also enforced via the explicit empty-list reply in the
    // CoursesDataTable EmptyState path.
    if (targetInstitutionIds.length === 0 || boardScope.boardsOf.size === 0) {
      return NextResponse.json({ data: [] });
    }

    // Per-institution fan-out — N parallel COE round-trips (boards + courses
    // each). N is bounded by the number of compositions a single user serves
    // on, which in practice is 1–3.
    const userBoardIds = boardScope.boardsOf;
    const perInstitution = await Promise.all(
      targetInstitutionIds.map(async (myJkknId) => {
        const coeInstitutionId = await resolveCoeInstitutionId(myJkknId);
        if (!coeInstitutionId) return [] as (BosCourseMaster & { board_code?: string })[];

        // 1. Resolve the user's board_codes for THIS institution.
        let allowedBoardCodes: Set<string>;
        try {
          const coeBoardsRaw = await client.get<unknown>('/api/v1/boards', {
            institutions_id: coeInstitutionId,
            is_active: 'true',
          });
          interface CoeBoard { id: string; board_code: string }
          const coeBoards: CoeBoard[] = Array.isArray(coeBoardsRaw)
            ? (coeBoardsRaw as CoeBoard[])
            : ((coeBoardsRaw as { data?: CoeBoard[] })?.data ?? []);
          allowedBoardCodes = new Set(
            coeBoards
              .filter((b) => userBoardIds.has(b.id))
              .map((b) => b.board_code?.toUpperCase())
              .filter((c): c is string => !!c),
          );
        } catch (boardsErr) {
          console.error('[bos/courses-master] failed to load COE boards for institution', myJkknId, boardsErr);
          return [];
        }
        if (allowedBoardCodes.size === 0) return [];

        // 2. Fetch ALL courses for THIS institution (paginated) then filter by
        //    board_code. COE ignores board filtering and returns a generic page
        //    that can be entirely one busy board (e.g. PG/PCA), so a single
        //    capped page would silently drop other boards the user belongs to
        //    (e.g. UG/UCS). Paginate the full set before filtering.
        const PAGE = 200;
        const MAX_PAGES = 12; // safety cap — 2400 courses/institution
        const all: (BosCourseMaster & { board_code?: string })[] = [];
        for (let p = 0; p < MAX_PAGES; p++) {
          const raw = await client.get<unknown>('/api/v1/courses', {
            institutions_id: coeInstitutionId,
            regulation_code: searchParams.get('regulation_code') ?? undefined,
            program_code:    searchParams.get('program_code') ?? undefined,
            search:          searchParams.get('search') ?? undefined,
            is_active:       searchParams.get('is_active') ?? 'true',
            limit:           String(PAGE),
            offset:          String(p * PAGE),
          }).catch((err) => {
            console.error('[bos/courses-master] courses page fetch failed', myJkknId, p, err);
            return null;
          });
          if (!raw) break;
          const institutionFiltered = filterByInstitution(raw, coeInstitutionId);
          const rows: (BosCourseMaster & { board_code?: string })[] = Array.isArray(institutionFiltered)
            ? (institutionFiltered as (BosCourseMaster & { board_code?: string })[])
            : (((institutionFiltered as BosCourseListResponse)?.data as (BosCourseMaster & { board_code?: string })[]) ?? []);
          all.push(...rows);
          if (rows.length < PAGE) break;
        }
        return all.filter((c) => {
          const code = (c.board_code ?? '').toUpperCase();
          return code !== '' && allowedBoardCodes.has(code);
        });
      }),
    );

    // Merge into a single response. Always return the wrapped `{ data }`
    // shape so the client doesn't have to special-case a flat array; the
    // CoursesDataTable unwraps either form.
    const merged = perInstitution.flat();
    return NextResponse.json({ data: merged });
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.error('[bos/courses-master] COE call failed', {
        status: error.status,
        message: error.message,
        coeBaseUrl: process.env.COE_API_URL,
        requestUrl: request.url,
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}

// ── POST /api/bos/courses-master ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization for course creates is composition membership — NOT the
    // role-permission grant. custom_roles.permissions reliably drifts out of
    // sync with bos_members (see [feedback_bos_membership_is_authorization]):
    // a valid active board member can lose the 'academic.bos-courses.create'
    // grant when their role is rotated, and would then be blocked here even
    // though the UI (which gates on memberOf) let them in.
    //
    // Defence-in-depth stays intact: guardCourseInstitutionWrite below
    // enforces the institution scope, and the boardsOf check after it
    // enforces the picked board. Removing the canAccessBos gate only
    // removes the redundant, drift-prone perm-key layer.
    //
    // Principals are intentionally excluded — they are read-only on board
    // data per spec (see guardCompositionChairman), so memberOf alone is
    // the right gate (a principal who also chairs a composition will have
    // memberOf populated and qualify on that path instead).
    const boardScope = await resolveBosBoardScope(user.id);

    if (!boardScope.isSuperAdmin && boardScope.memberOf.size === 0) {
      return NextResponse.json(
        { error: 'Forbidden: you must be an active BoS member to create courses' },
        { status: 403 },
      );
    }

    const body = await request.json();
    // Academic model (from the board) gates the schema strictness: year-based
    // pharmacy/AHS courses (mgr_pharmd, mgr_ahs) carry no credits/hours/category,
    // so the strict Anna schema would wrongly reject them.
    const academic_model: AcademicModel = body.context?.academic_model ?? 'anna_univ';
    const parsed = makeCourseFormSchema(academic_model).safeParse(body.form);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      institution_id,
      institution_code,
      regulation_code,
      regulation_id,
      board_code,
      board_id,
    } = body.context ?? {};
    if (!institution_id || !institution_code || !regulation_code) {
      return NextResponse.json(
        { error: 'context.institution_id, .institution_code, .regulation_code required' },
        { status: 400 }
      );
    }
    if (!board_code) {
      return NextResponse.json(
        { error: 'context.board_code is required — pick a board on the form' },
        { status: 400 }
      );
    }

    const writeError = guardCourseInstitutionWrite(boardScope, institution_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }
    // Belt-and-suspenders: the picked board must be one the user actually
    // serves on. Without this, a malformed client could pass a valid
    // institution but a board they don't belong to.
    if (!boardScope.isSuperAdmin && board_id && !boardScope.boardsOf.has(board_id)) {
      return NextResponse.json(
        { error: 'Forbidden: you can only create courses under boards you serve on' },
        { status: 403 },
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const ctx = {
      institutions_id: coeInstitutionId,
      institution_code,
      regulation_code,
      regulation_id,
      board_code,
      board_id,
      academic_model,
    };

    // Pre-flight duplicate check — course_code must be unique per institution.
    // We reject (do NOT silently upsert) so the user knows their action collided
    // with an existing record and can either pick a different code or go edit
    // the existing course explicitly.
    const searchRaw = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      search: parsed.data.course_code.toUpperCase(),
      limit: '10',
      offset: '0',
    });
    const searchRows: BosCourseMaster[] = Array.isArray(searchRaw)
      ? searchRaw as BosCourseMaster[]
      : ((searchRaw as BosCourseListResponse)?.data ?? []);

    const existing = searchRows.find(
      (c) => c.course_code?.toUpperCase() === parsed.data.course_code.toUpperCase()
    );

    if (existing) {
      const enteredCode = parsed.data.course_code.toUpperCase();
      return NextResponse.json(
        {
          error:
            `Course code "${enteredCode}" already exists for this institution. ` +
            `Use a unique code, or open the existing course to edit it.`,
          code: 'DUPLICATE_COURSE_CODE',
          existing: {
            id: existing.id,
            course_code: existing.course_code,
            course_name: existing.course_name,
          },
        },
        { status: 409 }
      );
    }

    const payload = toCoeCreatePayload(parsed.data, ctx);
    const created = await client.post<unknown>('/api/v1/courses', payload);
    return NextResponse.json(created as object, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master] POST error:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}