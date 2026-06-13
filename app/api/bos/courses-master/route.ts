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
} from '@/lib/utils/bos/bos-access';
import { courseFormSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
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

    const { searchParams } = new URL(request.url);
    const client = CoeRestClient.create();

    // ── Super-admin paths ────────────────────────────────────────────────────
    // Super-admins are not board-filtered. They may scope to one institution
    // via the institution_id query param, or omit it for an all-institutions
    // dump (the existing /api/v1/courses behaviour without institutions_id).
    if (scope.isSuperAdmin) {
      const effectiveInstitutionId = applyInstitutionScope(scope, searchParams.get('institution_id'));
      if (!effectiveInstitutionId) {
        const raw = await client.get<unknown>('/api/v1/courses', {
          regulation_code: searchParams.get('regulation_code') ?? undefined,
          search:          searchParams.get('search') ?? undefined,
          is_active:       searchParams.get('is_active') ?? 'true',
          limit:           searchParams.get('limit') ?? '200',
          offset:          searchParams.get('offset') ?? '0',
        });
        return NextResponse.json(raw);
      }
      const coeInstitutionId = await resolveCoeInstitutionId(effectiveInstitutionId);
      if (!coeInstitutionId) {
        return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
      }
      const raw = await client.get<unknown>('/api/v1/courses', {
        institutions_id: coeInstitutionId,
        regulation_code: searchParams.get('regulation_code') ?? undefined,
        program_code:    searchParams.get('program_code') ?? undefined,
        search:          searchParams.get('search') ?? undefined,
        is_active:       searchParams.get('is_active') ?? 'true',
        limit:           searchParams.get('limit') ?? '100',
        offset:          searchParams.get('offset') ?? '0',
      });
      return NextResponse.json(filterByInstitution(raw, coeInstitutionId));
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

        // 2. Fetch courses for THIS institution and filter by board_code.
        const raw = await client.get<unknown>('/api/v1/courses', {
          institutions_id: coeInstitutionId,
          regulation_code: searchParams.get('regulation_code') ?? undefined,
          program_code:    searchParams.get('program_code') ?? undefined,
          search:          searchParams.get('search') ?? undefined,
          is_active:       searchParams.get('is_active') ?? 'true',
          limit:           searchParams.get('limit') ?? '100',
          offset:          searchParams.get('offset') ?? '0',
        });
        const institutionFiltered = filterByInstitution(raw, coeInstitutionId);
        const rows: (BosCourseMaster & { board_code?: string })[] = Array.isArray(institutionFiltered)
          ? (institutionFiltered as (BosCourseMaster & { board_code?: string })[])
          : (((institutionFiltered as BosCourseListResponse)?.data as (BosCourseMaster & { board_code?: string })[]) ?? []);
        return rows.filter((c) => {
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
    const parsed = courseFormSchema.safeParse(body.form);
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