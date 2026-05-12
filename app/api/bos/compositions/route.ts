import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosCompositionFilters, CreateBosCompositionDto } from '@/types/bos';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/compositions ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

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
    console.error('[bos/compositions] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 });
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

    const scope = await resolveBosAccess(user.id);
    const body: CreateBosCompositionDto = await request.json();

    if (!body.institutions_id || !body.board_id || !body.composition_title) {
      return NextResponse.json(
        { error: 'institutions_id, board_id, and composition_title are required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Normalize empty strings → null for optional date/text columns so Postgres
    // doesn't reject them with "invalid input syntax for type date: ''"
    const payload = {
      ...body,
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
