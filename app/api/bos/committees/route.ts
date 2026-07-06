import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CreateBosCommitteeDto } from '@/types/bos';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/committees ──────────────────────────────────────────────────
// Institution-wise committee list. CAS-aware: accepts ?institutionsIds=<csv>
// (preferred — client expands siblings via useBosInstitutionScope) or the
// legacy single ?institutionsId=. Non-admins are clamped to their own scope.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);

    // Same CAS-aware id resolution as /api/bos/taxonomy GET:
    //   super-admin → trust client ids (empty = all institutions)
    //   non-admin   → client ids filtered to own scope; fallback to own scope
    const csv = searchParams.get('institutionsIds');
    const single = searchParams.get('institutionsId');
    const clientIds = csv
      ? csv.split(',').filter(Boolean)
      : single
        ? [single]
        : [];

    let ids: string[] = [];
    if (scope.isSuperAdmin) {
      ids = clientIds;
    } else {
      const allowed = new Set([
        ...(scope.institutionsId ? [scope.institutionsId] : []),
        ...scope.allInstitutionIds,
      ]);
      ids = clientIds.filter((id) => allowed.has(id));
      if (ids.length === 0) {
        ids = scope.allInstitutionIds.length > 0
          ? scope.allInstitutionIds
          : scope.institutionsId
            ? [scope.institutionsId]
            : [];
      }
      if (ids.length === 0) {
        return NextResponse.json({ data: [] });
      }
    }

    // Two response modes (same contract as /api/bos/member-types):
    //   • plain list (no `page` param) — full ordered list, used by the
    //     composition detail page and Add Member dialog
    //   • paginated (`page` present) — DataTable mode with metadata, used by
    //     the /bos/committees management page
    const paginated = searchParams.has('page');
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100);

    // Whitelisted sort columns — anything else falls back to sort_order.
    const SORTABLE = new Set(['name', 'short_code', 'sort_order', 'is_active', 'created_at']);
    const sortByParam = searchParams.get('sortBy') ?? '';
    const sortBy = SORTABLE.has(sortByParam) ? sortByParam : 'sort_order';
    const ascending = (searchParams.get('sortOrder') ?? 'asc') !== 'desc';

    let query = supabase
      .from('bos_committees')
      .select('*', { count: paginated ? 'exact' : undefined })
      .order(sortBy, { ascending })
      .order('name', { ascending: true });

    if (ids.length === 1) {
      query = query.eq('institutions_id', ids[0]);
    } else if (ids.length > 1) {
      query = query.in('institutions_id', ids);
    }

    // Committees are owned by a composition (20260706). The composition detail
    // page and Add Member dialog pass ?compositionId= to get only that
    // composition's committees; the institution filter above still applies as
    // an RLS-aligned belt-and-braces. Omitting it returns institution-level
    // template rows (composition_id IS NULL) plus every composition's rows.
    const compositionId = searchParams.get('compositionId');
    if (compositionId) {
      query = query.eq('composition_id', compositionId);
    } else if (searchParams.get('scope') === 'template') {
      // The standalone /bos/committees master page manages institution-level
      // TEMPLATE committees only (composition_id IS NULL); per-composition rows
      // are managed inside each composition. Without this it would list every
      // composition's committees as a flat, duplicate-heavy set.
      query = query.is('composition_id', null);
    }

    if (searchParams.has('isActive')) {
      query = query.eq('is_active', searchParams.get('isActive') === 'true');
    }
    const search = searchParams.get('search');
    if (search) {
      query = query.or(`name.ilike.%${search}%,short_code.ilike.%${search}%`);
    }

    if (paginated) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[GET /api/bos/committees] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch committees' }, { status: 500 });
    }

    if (paginated) {
      return NextResponse.json({
        data: data ?? [],
        metadata: {
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
        },
      });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/committees] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch committees' }, { status: 500 });
  }
}

// ── POST /api/bos/committees ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body: CreateBosCommitteeDto = await request.json();

    if (!body.name?.trim() || !body.institutions_id) {
      return NextResponse.json(
        { error: 'name and institutions_id are required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { data, error } = await supabase
      .from('bos_committees')
      .insert({
        institutions_id: body.institutions_id,
        composition_id: body.composition_id ?? null,
        name: body.name.trim(),
        short_code: body.short_code?.trim() || null,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      // 23505 = the per-institution unique name/short_code index fired.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A committee with this name or short code already exists for this institution.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/committees] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to create committee' },
      { status: 500 }
    );
  }
}
