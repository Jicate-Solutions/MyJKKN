import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { BosExpertFilters, CreateBosExpertDto } from '@/types/bos';
import { resolveBosAccess, resolveBosBoardScope, guardInstitutionWrite, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/experts ─────────────────────────────────────────────────────
// Returns a paginated, filtered list of external experts for the institution.
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate via MyJKKN session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a role holding academic.bos-experts.view but on no
    // board (not a principal, member of nothing) may read all institutions'
    // experts. VIEW ONLY — POST still goes through guardInstitutionWrite.
    const hasView = await hasBosPermission(user.id, 'academic.bos-experts.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;

    // 2. Parse query params
    const { searchParams } = new URL(request.url);

    // Cross-institution lookup mode for the BoS Composition "Add Member"
    // picker. External experts are intentionally shareable across boards,
    // so when this flag is set we drop the institution scope on read.
    // Writes (POST/PUT/DELETE) still go through guardInstitutionWrite.
    const allInstitutions = searchParams.get('allInstitutions') === 'true';

    const filters: BosExpertFilters = {
      institutionsId: allInstitutions
        ? undefined
        : seeAll
          ? (searchParams.get('institutionsId') ?? undefined)
          : (scope.institutionsId ?? undefined),
      category: searchParams.get('category') as BosExpertFilters['category'] ?? undefined,
      isActive: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') ?? 'name',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'asc',
    };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100); // cap at 100
    const offset = (page - 1) * limit;

    // 3. Query MyJKKN database
    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    // A principal convening a council (Academic Council / Governing Body) uses the
    // cross-institution "Add Member" expert picker (allInstitutions=true). External
    // experts are intentionally shareable and this is read-only, but the board-keyed
    // RLS (bos_experts_select evaluates role_has_institution_access per row) blocks a
    // principal from that whole-directory read — so serve it via service-role too.
    const readDb =
      canReadAllBos || (scope.isPrincipal && allInstitutions)
        ? createServiceRoleClient()
        : supabase;
    let query = readDb
      .from('bos_external_experts')
      .select('*', { count: 'exact' });

    if (filters.institutionsId) {
      query = query.eq('institutions_id', filters.institutionsId);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,institution_name.ilike.%${filters.search}%,specialization.ilike.%${filters.search}%`
      );
    }

    query = query
      .order(filters.sortBy ?? 'name', { ascending: filters.sortOrder !== 'desc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data ?? [],
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error('[bos/experts] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch experts' }, { status: 500 });
  }
}

// ── POST /api/bos/experts ────────────────────────────────────────────────────
// Creates a new external expert record.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body: CreateBosExpertDto = await request.json();

    if (!body.name || !body.category || !body.institutions_id) {
      return NextResponse.json(
        { error: 'name, category, and institutions_id are required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { data, error } = await supabase
      .from('bos_external_experts')
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/experts] POST error:', error);
    return NextResponse.json({ error: 'Failed to create expert' }, { status: 500 });
  }
}
