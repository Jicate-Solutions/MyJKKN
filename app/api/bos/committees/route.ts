import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CreateBosCommitteeDto } from '@/types/bos';
import { resolveBosAccess, resolveBosBoardScope, guardInstitutionWrite, hasBosPermission, isBosReadAllObserver } from '@/lib/utils/bos/bos-access';

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

    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a role holding academic.bos-compositions.view but on no
    // board (not a principal, member of nothing) may read all institutions'
    // committees. VIEW ONLY — POST still goes through guardInstitutionWrite.
    const hasView = await hasBosPermission(user.id, 'academic.bos-compositions.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;
    const { searchParams } = new URL(request.url);

    // Same CAS-aware id resolution as /api/bos/taxonomy GET:
    //   super-admin / observer → trust client ids (empty = all institutions)
    //   non-admin   → client ids filtered to own scope; fallback to own scope
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

    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    const readDb = canReadAllBos ? createServiceRoleClient() : supabase;

    // Committees are owned by a composition (20260706). The composition detail
    // page and Add Member dialog pass ?compositionId= to get only that
    // composition's committees; the institution filter still applies as an
    // RLS-aligned belt-and-braces. Omitting it returns institution-level
    // template rows (composition_id IS NULL) plus every composition's rows.
    const compositionId = searchParams.get('compositionId');
    const scopeParam = searchParams.get('scope');
    const search = searchParams.get('search');

    // Filters live in a builder so the out-of-range-page recovery below can
    // re-run them as a count-only query without duplicating the predicates.
    const buildQuery = (select: string, opts?: { head?: boolean; count?: boolean }) => {
      let q = readDb
        .from('bos_committees')
        .select(select, {
          count: opts?.count ? 'exact' : undefined,
          head: opts?.head,
        });

      if (ids.length === 1) {
        q = q.eq('institutions_id', ids[0]);
      } else if (ids.length > 1) {
        q = q.in('institutions_id', ids);
      }

      if (compositionId) {
        q = q.eq('composition_id', compositionId);
      } else if (scopeParam === 'template') {
        // The standalone /bos/committees master page's default view manages
        // institution-level TEMPLATE committees only (composition_id IS NULL);
        // per-composition rows are managed inside each composition.
        q = q.is('composition_id', null);
      }
      // scope === 'all' (the master page's "All" toggle) applies no composition
      // filter — templates AND every composition's committees. Rows are enriched
      // below with their composition title so instances stay distinguishable.

      if (searchParams.has('isActive')) {
        q = q.eq('is_active', searchParams.get('isActive') === 'true');
      }
      if (search) {
        q = q.or(`name.ilike.%${search}%,short_code.ilike.%${search}%`);
      }
      return q;
    };

    let query = buildQuery('*', { count: paginated })
      .order(sortBy, { ascending })
      .order('name', { ascending: true });

    const offset = (page - 1) * limit;
    if (paginated) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;
    if (error) {
      // PGRST103 ("Requested range not satisfiable") — the offset is past the
      // end of the result set. That's an empty page, NOT a failure: a stale
      // ?page= in the URL routinely outlives a filter/scope change that shrank
      // the list (e.g. scope=all's many pages → scope=template's one), and
      // treating it as fatal made the page a permanent opaque 500. Return the
      // real total so the DataTable can clamp back to a valid page.
      if (paginated && (error as { code?: string }).code === 'PGRST103') {
        const { count: total } = await buildQuery('id', { head: true, count: true });
        return NextResponse.json({
          data: [],
          metadata: {
            total: total ?? 0,
            page,
            limit,
            totalPages: Math.ceil((total ?? 0) / limit),
          },
        });
      }
      console.error('[GET /api/bos/committees] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch committees' }, { status: 500 });
    }

    // Enrich the paginated master list with each row's composition title so the
    // "All" view can label instances (an unlabelled all-committees list is a
    // wall of identical names). Done via service-role — bos_compositions carries
    // its own member/creator RLS, so a PostgREST embed on the user client would
    // silently null the title for non-admins. The committee query above keeps
    // its user-level access control; this only resolves display labels.
    let rows = data ?? [];
    if (paginated && rows.length > 0) {
      const compIds = [
        ...new Set(rows.map((r) => r.composition_id).filter(Boolean) as string[]),
      ];
      if (compIds.length > 0) {
        const svc = createServiceRoleClient();
        const { data: comps } = await svc
          .from('bos_compositions')
          .select('id, composition_title')
          .in('id', compIds);
        const titleById = new Map(
          (comps ?? []).map((c) => [c.id as string, c.composition_title as string])
        );
        rows = rows.map((r) => ({
          ...r,
          composition_title: r.composition_id
            ? titleById.get(r.composition_id) ?? null
            : null,
        }));
      }
    }

    if (paginated) {
      return NextResponse.json({
        data: rows,
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
