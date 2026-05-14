import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosCompositionFilters, CreateBosCompositionDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  guardInstitutionWrite,
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
    const scopeFilter = compositionScopeFilter(scope);

    // For compositions specifically we cannot early-return on 'none' because
    // a user with zero memberships might still have created comps that are
    // pending member setup. We let the query run with a created_by filter.

    const { searchParams } = new URL(request.url);

    // Resolve which institution IDs to filter by.
    // Super-admin: use client-supplied list or single ID.
    // Non-admin CAS: client may pass COE-authoritative myjkkn_institution_ids —
    //   validate each against the user's own scope before trusting them.
    //   Falls back to server-resolved allInstitutionIds (Supabase counselling_code join).
    let multiInstitutionIds: string | undefined;
    if (scope.isSuperAdmin) {
      multiInstitutionIds = searchParams.get('institutionIds') ?? undefined;
    } else {
      const clientIds = searchParams.get('institutionIds')?.split(',').filter(Boolean) ?? [];
      if (clientIds.length > 0) {
        // Accept only IDs that belong to this user's own institution scope.
        const allowed = new Set([
          ...(scope.institutionsId ? [scope.institutionsId] : []),
          ...scope.allInstitutionIds,
        ]);
        const valid = clientIds.filter((id) => allowed.has(id));
        if (valid.length > 0) multiInstitutionIds = valid.join(',');
      }
      // Server-side fallback: use Supabase counselling_code siblings when no client list.
      if (!multiInstitutionIds && scope.allInstitutionIds.length > 1) {
        multiInstitutionIds = scope.allInstitutionIds.join(',');
      }
    }

    const filters: BosCompositionFilters = {
      institutionsId: scope.isSuperAdmin
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

    let query = supabase
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
    if (!scope.isSuperAdmin && !scope.isPrincipal) {
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

    // Flatten member_count from PostgREST aggregate array to a scalar, attach board
    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      member_count: row.member_count?.[0]?.count ?? 0,
      board: boardMap[row.board_id] ?? null,
    }));

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

    if (!body.board_id || !body.composition_title) {
      return NextResponse.json(
        { error: 'board_id and composition_title are required' },
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

    // Normalize empty strings → null for optional date/text columns so Postgres
    // doesn't reject them with "invalid input syntax for type date: ''"
    // created_by is stamped from the auth user so the GET visibility guard can
    // see this row even before bos_members rows exist for it.
    const payload = {
      ...body,
      institutions_id: institutionsId,
      created_by: user.id,
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

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/compositions] POST error:', error);
    return NextResponse.json({ error: 'Failed to create composition' }, { status: 500 });
  }
}
