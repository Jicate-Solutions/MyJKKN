import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CreateBosMemberTypeDto } from '@/types/bos';
import { resolveBosAccess, resolveBosBoardScope, guardInstitutionWrite, casSiblingInstitutionIds, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/member-types ────────────────────────────────────────────────
// Institution-wise member type list. Same CAS-aware contract as
// /api/bos/committees: ?institutionsIds=<csv> preferred, single
// ?institutionsId= accepted; non-admins clamped to their own scope.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a role holding academic.bos-members.view but on no
    // board (not a principal, member of nothing) may read all institutions'
    // member types. VIEW ONLY — POST still goes through guardInstitutionWrite.
    const hasView = await hasBosPermission(user.id, 'academic.bos-members.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;
    const { searchParams } = new URL(request.url);

    const csv = searchParams.get('institutionsIds');
    const single = searchParams.get('institutionsId');
    const clientIds = csv
      ? csv.split(',').filter(Boolean)
      : single
        ? [single]
        : [];

    let ids: string[] = [];
    if (seeAll) {
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

    // Two response modes:
    //   • plain list (no `page` param) — full ordered list, used by the
    //     composition detail page and Add Member dialog
    //   • paginated (`page` present) — DataTable mode with metadata, used by
    //     the /bos/member-types management page
    const paginated = searchParams.has('page');
    const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100);

    // Whitelisted sort columns — anything else falls back to sort_order.
    const SORTABLE = new Set(['name', 'base_type', 'sort_order', 'is_active', 'created_at']);
    const sortByParam = searchParams.get('sortBy') ?? '';
    const sortBy = SORTABLE.has(sortByParam) ? sortByParam : 'sort_order';
    const ascending = (searchParams.get('sortOrder') ?? 'asc') !== 'desc';

    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    const readDb = canReadAllBos ? createServiceRoleClient() : supabase;
    let query = readDb
      .from('bos_member_types')
      .select('*', { count: paginated ? 'exact' : undefined })
      .order(sortBy, { ascending })
      .order('name', { ascending: true });

    if (ids.length === 1) {
      query = query.eq('institutions_id', ids[0]);
    } else if (ids.length > 1) {
      query = query.in('institutions_id', ids);
    }

    if (searchParams.has('isActive')) {
      query = query.eq('is_active', searchParams.get('isActive') === 'true');
    }
    const baseType = searchParams.get('baseType');
    if (baseType) {
      query = query.eq('base_type', baseType);
    }
    const search = searchParams.get('search');
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (paginated) {
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[GET /api/bos/member-types] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch member types' }, { status: 500 });
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
    console.error('[GET /api/bos/member-types] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch member types' }, { status: 500 });
  }
}

// ── POST /api/bos/member-types ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body: CreateBosMemberTypeDto = await request.json();

    if (!body.name?.trim() || !body.institutions_id || !body.base_type) {
      return NextResponse.json(
        { error: 'name, base_type, and institutions_id are required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // CAS-aware duplicate guard. The DB unique index is per (institutions_id,
    // lower(name)) so it can't see the sibling UUID: a CAS college has two
    // institution ids (Aided + Self) sharing one counselling_code, and the
    // /bos/member-types list fans out across both. Without this check a user on
    // one sibling could recreate a name that already exists on the other,
    // reintroducing the very duplicates the list is meant to avoid. Expand the
    // target institution to its counselling_code siblings and reject up front.
    const siblingIds = await casSiblingInstitutionIds(supabase, body.institutions_id);
    const { data: clash } = await supabase
      .from('bos_member_types')
      .select('id')
      .in('institutions_id', siblingIds)
      .ilike('name', body.name.trim())
      .limit(1);
    if (clash && clash.length > 0) {
      return NextResponse.json(
        { error: 'A member type with this name already exists for this institution.' },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('bos_member_types')
      .insert({
        institutions_id: body.institutions_id,
        name: body.name.trim(),
        base_type: body.base_type,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      // 23505 = per-institution unique name; 23514 = base_type CHECK.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A member type with this name already exists for this institution.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/member-types] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to create member type' },
      { status: 500 }
    );
  }
}
