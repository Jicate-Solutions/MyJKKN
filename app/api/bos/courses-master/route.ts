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
  guardInstitutionWrite,
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

    // Resolve permission + board-aware scope in parallel. boardsOf will be
    // used below to restrict non-admin callers to courses whose programme is
    // assigned to a board they belong to.
    const [hasAccess, scope, boardScope] = await Promise.all([
      canAccessBos(user.id, 'academic.bos-courses', 'view'),
      resolveBosAccess(user.id),
      resolveBosBoardScope(user.id),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Non-super-admins are forced to their own institution regardless of what
    // the client sends. Super-admins use the client-provided value (may be null = all).
    const effectiveInstitutionId = applyInstitutionScope(scope, searchParams.get('institution_id'));

    if (!effectiveInstitutionId && !scope.isSuperAdmin) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Board-scoped filter for non-super-admins:
    //   - super-admin → sees all courses for the institution(s) in scope
    //   - everyone else → sees only courses whose board_code is assigned to
    //     one of their compositions (boardsOf). Empty boards → empty list.
    //
    // Courses are board-level entities in COE; we use COE's /api/v1/boards
    // to translate the user's board_ids (= COE board UUIDs stored on
    // bos_compositions.board_id) into board_codes, then filter the courses
    // response by board_code.
    //
    // (Course-scheme / course-mapping is the program_code-level filter and
    // lives in /api/bos/course-mapping — not here.)
    let allowedBoardCodes: Set<string> | null = null;
    if (!scope.isSuperAdmin) {
      const userBoardIds = Array.from(boardScope.boardsOf);
      if (userBoardIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      // The COE boards fetch needs the COE institution id. We resolve it
      // here even though the All-institutions path below doesn't use it,
      // because a non-super-admin always has a single effective institution.
      const coeInstForBoards = effectiveInstitutionId
        ? await resolveCoeInstitutionId(effectiveInstitutionId)
        : null;
      if (coeInstForBoards) {
        try {
          const coe = CoeRestClient.create();
          const coeBoardsRaw = await coe.get<unknown>('/api/v1/boards', {
            institutions_id: coeInstForBoards,
            is_active: 'true',
          });
          interface CoeBoard { id: string; board_code: string }
          const coeBoards: CoeBoard[] = Array.isArray(coeBoardsRaw)
            ? (coeBoardsRaw as CoeBoard[])
            : ((coeBoardsRaw as { data?: CoeBoard[] })?.data ?? []);
          allowedBoardCodes = new Set(
            coeBoards
              .filter((b) => userBoardIds.includes(b.id))
              .map((b) => b.board_code?.toUpperCase())
              .filter((c): c is string => !!c)
          );
        } catch (boardsErr) {
          console.error('[bos/courses-master] failed to load COE boards for board-scope filter', boardsErr);
          allowedBoardCodes = new Set();
        }
      }
      if (!allowedBoardCodes || allowedBoardCodes.size === 0) {
        return NextResponse.json({ data: [] });
      }
    }

    const client = CoeRestClient.create();

    // All-institutions mode (super-admin, no institution selected).
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

    // COE may return all courses regardless of institutions_id — filter defensively.
    const institutionFiltered = filterByInstitution(raw, coeInstitutionId);

    // Board-scope filter for non-admins: restrict to courses whose board_code
    // belongs to one of the user's boards. Applied AFTER the COE call because
    // COE's /api/v1/courses doesn't expose a multi-board filter — we'd need
    // N parallel requests otherwise. board_code is part of the COE course
    // payload even though the typed BosCourseMaster doesn't declare it
    // (the file's comment says extra COE columns are passed through).
    if (allowedBoardCodes) {
      const keep = (c: BosCourseMaster & { board_code?: string }): boolean => {
        const code = (c.board_code ?? '').toUpperCase();
        return code !== '' && allowedBoardCodes!.has(code);
      };
      if (Array.isArray(institutionFiltered)) {
        return NextResponse.json((institutionFiltered as (BosCourseMaster & { board_code?: string })[]).filter(keep));
      }
      const wrapped = institutionFiltered as BosCourseListResponse;
      if (wrapped && Array.isArray(wrapped.data)) {
        return NextResponse.json({
          ...wrapped,
          data: (wrapped.data as (BosCourseMaster & { board_code?: string })[]).filter(keep),
        });
      }
    }

    return NextResponse.json(institutionFiltered);
  } catch (error) {
    if (error instanceof CoeApiError) {
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

    const [hasAccess, scope] = await Promise.all([
      canAccessBos(user.id, 'academic.bos-courses', 'create'),
      resolveBosAccess(user.id),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const writeError = guardInstitutionWrite(scope, institution_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
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