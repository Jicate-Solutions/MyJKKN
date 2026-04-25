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
    const filters: BosCompositionFilters = {
      // Non-super-admin users are locked to their own institution
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

    // Fetch compositions with member count. board fields omitted — board table lives in COE.
    let query = supabase
      .from('bos_compositions')
      .select(
        `*, member_count:bos_members(count)`,
        { count: 'exact' }
      );

    if (filters.institutionsId) query = query.eq('institutions_id', filters.institutionsId);
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

    // Flatten member_count from PostgREST aggregate array to a scalar
    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      member_count: row.member_count?.[0]?.count ?? 0,
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
