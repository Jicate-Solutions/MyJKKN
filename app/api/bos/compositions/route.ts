import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BosCompositionFilters, CreateBosCompositionDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  guardInstitutionWrite,
  hasBosPermission,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/compositions ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use the board-aware scope: super-admin sees all, principal sees every
    // composition in their institution(s), regular members see comps they
    // belong to OR comps they created (bootstrap case — new HOD has no member
    // row yet for the comp they just made).
    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a view-only role (no board membership, not a principal)
    // holding academic.bos-compositions.view sees every institution's
    // compositions (view-only). Never gates any write below.
    const hasView = await hasBosPermission(user.id, 'academic.bos-compositions.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;
    const scopeFilter = compositionScopeFilter(scope, canReadAllBos);

    // For compositions specifically we cannot early-return on 'none' because
    // a user with zero memberships might still have created comps that are
    // pending member setup. We let the query run with a created_by filter.

    const { searchParams } = new URL(request.url);

    // Resolve which institution IDs to filter by.
    //
    // Preferred path — `institutionCode` (= counselling_code, the authoritative
    // cross-DB key). Resolves to all MyJKKN sibling UUIDs (CAS Aided + Self
    // both belong to ONE code) via the COE MDM, so callers don't need to know
    // about the Aided/Self split.
    //
    // Legacy paths (still supported for callers that pass UUIDs directly):
    //   • super-admin → `institutionIds`/`institutionsId` trusted as-is
    //   • non-admin   → `institutionIds` validated against the user's scope
    //                   before being trusted
    let multiInstitutionIds: string | undefined;

    const institutionCode = searchParams.get('institutionCode');
    if (institutionCode) {
      const { resolveInstitutionContextByCode } = await import(
        '@/lib/utils/institutions/institution-resolver'
      );
      const ctx = await resolveInstitutionContextByCode(institutionCode, supabase);
      const ids = ctx?.myjkkn_institution_ids ?? [];

      if (seeAll) {
        if (ids.length > 0) multiInstitutionIds = ids.join(',');
      } else {
        // Non-admin: keep only IDs that belong to the caller's own scope.
        const allowed = new Set([
          ...(scope.institutionsId ? [scope.institutionsId] : []),
          ...scope.allInstitutionIds,
        ]);
        const valid = ids.filter((id) => allowed.has(id));
        if (valid.length > 0) multiInstitutionIds = valid.join(',');
      }
    }

    if (!multiInstitutionIds) {
      if (seeAll) {
        multiInstitutionIds = searchParams.get('institutionIds') ?? undefined;
      } else {
        const clientIds =
          searchParams.get('institutionIds')?.split(',').filter(Boolean) ?? [];
        if (clientIds.length > 0) {
          const allowed = new Set([
            ...(scope.institutionsId ? [scope.institutionsId] : []),
            ...scope.allInstitutionIds,
          ]);
          const valid = clientIds.filter((id) => allowed.has(id));
          if (valid.length > 0) multiInstitutionIds = valid.join(',');
        }
        if (!multiInstitutionIds && scope.allInstitutionIds.length > 1) {
          multiInstitutionIds = scope.allInstitutionIds.join(',');
        }
      }
    }

    const filters: BosCompositionFilters = {
      institutionsId: seeAll
        ? (searchParams.get('institutionsId') ?? undefined)
        : (scope.institutionsId ?? undefined),
      boardId: searchParams.get('boardId') ?? undefined,
      academicYear: searchParams.get('academicYear') ?? undefined,
      isActive: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') ?? 'term_start_date',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'desc',
    };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    // Service-role for the SELECT: bos_compositions board-scope RLS (20260514)
    // applies on the user-context client as an AND, independently HIDING rows the
    // route's own authz intends to show — capping super-admin and hiding members'
    // own comps. Route-level authz below is the source of truth:
    //   super-admin → no filter (sees all)
    //   principal   → institution filter (sees their institution)
    //   member/chair→ .or(created_by OR id.in(memberOf)) — restricted to OWN board
    // Same precedent as /api/bos/meetings and /api/bos/meetings/[id]/attendance.
    const db = createServiceRoleClient();
    let query = db
      .from('bos_compositions')
      .select(`*, member_count:bos_members(count)`, { count: 'exact' });

    if (multiInstitutionIds) {
      const ids = multiInstitutionIds.split(',').filter(Boolean);
      if (ids.length === 1) query = query.eq('institutions_id', ids[0]);
      else if (ids.length > 1) query = query.in('institutions_id', ids);
    } else if (filters.institutionsId) {
      query = query.eq('institutions_id', filters.institutionsId);
    }

    // Board-membership + creator scope (layered on the institution clause above):
    //   super-admin  → no extra filter
    //   principal    → institution filter above is sufficient
    //   everyone else → row must be one of (member-of OR created-by-me).
    //                   PostgREST `.or()` accepts a comma-separated condition list;
    //                   we use `id.in.(uuid,uuid,...)` to express the member set
    //                   in a single clause instead of N `id.eq.` clauses.
    if (!seeAll && !scope.isPrincipal) {
      const memberIds = scope.memberOf.size > 0 ? Array.from(scope.memberOf) : [];
      const orClauses: string[] = [`created_by.eq.${user.id}`];
      if (memberIds.length > 0) {
        orClauses.push(`id.in.(${memberIds.join(',')})`);
      }
      query = query.or(orClauses.join(','));
    }
    // Reference scopeFilter to silence the "unused" warning while we keep the
    // discriminated union available for future tightening (e.g. principal
    // explicit institution filter when allInstitutionIds is partial).
    void scopeFilter;

    if (filters.boardId) query = query.eq('board_id', filters.boardId);
    if (filters.academicYear) query = query.eq('academic_year', filters.academicYear);
    if (filters.isActive !== undefined) query = query.eq('is_active', filters.isActive);
    if (filters.search) {
      query = query.ilike('composition_title', `%${filters.search}%`);
    }

    query = query
      .order(filters.sortBy ?? 'term_start_date', {
        ascending: filters.sortOrder !== 'desc',
      })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Enrich with board data from COE API.
    const institutionIdsInPage = [...new Set((data ?? []).map((r: any) => r.institutions_id).filter(Boolean))];
    const { fetchCoeBoardMaps } = await import('@/lib/utils/bos/coe-boards');
    const coeBoardMap = await fetchCoeBoardMaps(institutionIdsInPage);
    const boardMap: Record<string, { board_code: string; board_name: string; board_type?: string | null }> = {};
    for (const [id, b] of coeBoardMap) {
      boardMap[id] = { board_code: b.board_code, board_name: b.board_name, board_type: b.board_type };
    }

    // Multi-board: load each composition's full board set from the junction so
    // callers (e.g. the syllabus form) can offer a board picker.
    const compIds = (data ?? []).map((r: any) => r.id);
    const { data: jbRows } = compIds.length
      ? await db
          .from('bos_composition_boards')
          .select('composition_id, board_id')
          .in('composition_id', compIds)
      : { data: [] as { composition_id: string; board_id: string }[] };
    const boardIdsByComp = new Map<string, string[]>();
    for (const r of (jbRows ?? []) as { composition_id: string; board_id: string }[]) {
      const arr = boardIdsByComp.get(r.composition_id) ?? [];
      arr.push(r.board_id);
      boardIdsByComp.set(r.composition_id, arr);
    }

    // Flatten member_count from PostgREST aggregate array to a scalar, attach board(s)
    const normalized = (data ?? []).map((row: any) => {
      const bIds = boardIdsByComp.get(row.id) ?? (row.board_id ? [row.board_id] : []);
      return {
        ...row,
        member_count: row.member_count?.[0]?.count ?? 0,
        board: boardMap[row.board_id] ?? null,
        board_ids: bIds,
        boards: bIds
          .map((bid) => (boardMap[bid] ? { id: bid, ...boardMap[bid] } : null))
          .filter((b): b is { id: string; board_code: string; board_name: string; board_type?: string | null } => b !== null),
      };
    });

    const matched = normalized.filter((r: any) => r.board).length;
    if (matched < normalized.length) {
      const sampleMisses = normalized
        .filter((r: any) => !r.board)
        .slice(0, 3)
        .map((r: any) => ({ id: r.id, board_id: r.board_id, institutions_id: r.institutions_id }));
      console.warn(
        '[bos/compositions] board enrichment misses: %d/%d rows have null board. institutionIdsInPage=%j, coeBoardMap.size=%d, sample misses=%j',
        normalized.length - matched,
        normalized.length,
        institutionIdsInPage,
        coeBoardMap.size,
        sampleMisses,
      );
    }

    return NextResponse.json({
      data: normalized,
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    // Log full Postgres error (code + message + hint) so missing-column /
    // bad-filter cases like the unapplied 'created_by' migration surface in
    // the server console instead of being swallowed by the generic 500.
    const pgErr = error as { code?: string; message?: string; hint?: string; details?: string };
    console.error('[bos/compositions] GET error:', {
      code: pgErr.code,
      message: pgErr.message,
      hint: pgErr.hint,
      details: pgErr.details,
    });
    // 42703 = undefined_column. Most likely cause: 20260514 RLS migration
    // (which adds bos_compositions.created_by) has not been applied yet.
    if (pgErr.code === '42703') {
      return NextResponse.json(
        {
          error:
            'Database schema is out of date — run `supabase db push` to apply pending migrations (missing column: created_by).',
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: pgErr.message ?? 'Failed to fetch compositions' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/compositions ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const body: CreateBosCompositionDto = await request.json();

    // Principal cannot create compositions — they're read-only on board data.
    if (scope.isPrincipal) {
      return NextResponse.json(
        { error: 'Forbidden: principals cannot create compositions' },
        { status: 403 }
      );
    }

    // Multi-board: board_ids is the source of truth; board_id (primary) falls
    // back from it for single-board callers.
    const boardIds: string[] = Array.isArray(body.board_ids) && body.board_ids.length
      ? body.board_ids.filter(Boolean)
      : (body.board_id ? [body.board_id] : []);
    const primaryBoardId = boardIds[0];

    if (boardIds.length === 0 || !body.composition_title) {
      return NextResponse.json(
        { error: 'At least one board and composition_title are required' },
        { status: 400 }
      );
    }

    // Source-of-truth for institution: the HOD's own staff/profile record
    // (scope.userInstitutionId). Client-supplied institutions_id is IGNORED for
    // non-super-admins to prevent cross-institution writes via tampered bodies.
    let institutionsId: string | undefined;
    if (scope.isSuperAdmin) {
      institutionsId = body.institutions_id;
      if (!institutionsId) {
        return NextResponse.json(
          { error: 'institutions_id is required for super-admin requests' },
          { status: 400 }
        );
      }
    } else {
      institutionsId = scope.userInstitutionId ?? undefined;
      if (!institutionsId) {
        return NextResponse.json(
          { error: 'Your account has no institution assignment — cannot create composition' },
          { status: 403 }
        );
      }
    }

    // Backstop institution-level check (super-admin trivially passes).
    const deny = guardInstitutionWrite(scope, institutionsId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Resolve board_type from the COE boards endpoint. Denormalized onto the
    // composition row so meeting-create + call-letter PDF render don't each
    // need their own COE round-trip. Best-effort — if COE is unreachable or
    // the board isn't in the map, we persist null and downstream callers fall
    // back to board_name only. The 20260521 migration allows NULL for this
    // exact reason.
    let resolvedBoardType: string | null = null;
    try {
      const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
      const boardMap = await fetchCoeBoardMap(institutionsId);
      resolvedBoardType = boardMap.get(primaryBoardId)?.board_type ?? null;
    } catch (boardLookupErr) {
      console.warn('[bos/compositions] board_type lookup failed:', boardLookupErr);
    }

    // Normalize empty strings → null for optional date/text columns so Postgres
    // doesn't reject them with "invalid input syntax for type date: ''"
    // created_by is stamped from the auth user so the GET visibility guard can
    // see this row even before bos_members rows exist for it.
    // board_ids/boards are not columns on bos_compositions — strip them; the
    // junction is written separately below. board_id stores the primary.
    const { board_ids: _omitBoardIds, boards: _omitBoards, ...restBody } = body as
      CreateBosCompositionDto & { boards?: unknown };
    const payload = {
      ...restBody,
      board_id: primaryBoardId,
      institutions_id: institutionsId,
      created_by: user.id,
      board_type: resolvedBoardType,
      ratified_date: body.ratified_date || null,
      term_end_date: body.term_end_date || null,
      constituted_by: body.constituted_by || null,
    };

    const { data, error } = await supabase
      .from('bos_compositions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A composition for this board already exists for the selected term start date.' },
          { status: 409 }
        );
      }
      throw error;
    }

    // Multi-board junction: write a row per board (is_primary on the first).
    // Service-role — same precedent as the SELECT above; route-level chairman/
    // creator authz already gates this write.
    const db2 = createServiceRoleClient();
    const { error: jErr } = await db2.from('bos_composition_boards').insert(
      boardIds.map((bid, i) => ({ composition_id: data.id, board_id: bid, is_primary: i === 0 })),
    );
    if (jErr) console.error('[bos/compositions] junction insert failed:', jErr);

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/compositions] POST error:', error);
    return NextResponse.json({ error: 'Failed to create composition' }, { status: 500 });
  }
}
