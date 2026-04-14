export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleAuditLogRow {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_role_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  description: string;
  affected_user_count: number | null;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  actionType: string;
  actorName: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  targetRoleId: string | null;
  description: string;
  affectedUserCount: number;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityResponse {
  entries: ActivityEntry[];
  stats: {
    total: number;
    byActionType: Record<string, number>;
    topActors: Array<{ actorName: string; count: number }>;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/permissions-audit/activity
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  await connection();

  try {
    // ── Parse & validate query params ───────────────────────────────────────
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10) || 50)
    );
    const days = parseInt(searchParams.get('days') ?? '30', 10) || 30;
    const actionTypeParam = searchParams.get('actionType') ?? '';
    const actorId = searchParams.get('actorId') ?? '';
    const search = searchParams.get('search') ?? '';

    if (pageSize > 200) {
      return NextResponse.json(
        { error: 'pageSize must be 200 or less' },
        { status: 400 }
      );
    }

    if (days > 365) {
      return NextResponse.json(
        { error: 'days must be 365 or less' },
        { status: 400 }
      );
    }

    const actionTypes = actionTypeParam
      ? actionTypeParam.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const offset = (page - 1) * pageSize;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ── Supabase client (anon key — RLS handles access) ─────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      }
    );

    // ── Auth check ───────────────────────────────────────────────────────────
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Permission check ─────────────────────────────────────────────────────
    // Allow: super_admin, administrator, OR users.permissions_audit.view
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const isSuperAdmin =
      profile.is_super_admin === true || profile.role === 'super_admin';
    const isAdministrator = profile.role === 'administrator';

    if (!isSuperAdmin && !isAdministrator) {
      // Check dynamic permission via user_has_permission — call an RPC that
      // the DB already exposes, or fall back to checking user_roles + custom_roles.
      // The simplest approach: just attempt the query — RLS will reject it if
      // the user lacks 'users.permissions_audit.view'. We handle the error below.
      // But we need to guard access at the app layer too for a clean 403 vs 200.
      // We use a lightweight RPC check if available, otherwise let RLS decide.
      const { data: permCheck, error: permError } = await supabase.rpc(
        'user_has_permission',
        { permission_name: 'users.permissions_audit.view' }
      );

      if (permError || permCheck !== true) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // ── Main paginated query ─────────────────────────────────────────────────
    let query = supabase
      .from('role_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .gte('created_at', cutoff);

    if (actionTypes.length > 0) {
      query = query.in('action_type', actionTypes);
    }

    if (actorId) {
      query = query.eq('actor_user_id', actorId);
    }

    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data: rows, error: rowsError, count } = await query;

    if (rowsError) {
      console.error('[permissions-audit/activity] Query error:', rowsError);
      return NextResponse.json(
        { error: 'Failed to fetch activity log' },
        { status: 500 }
      );
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // ── Stats queries ────────────────────────────────────────────────────────
    // Both stats queries share the same date/filter constraints (minus pagination).
    // We run them in parallel for performance.

    // Build a base filter object to reuse
    const buildStatsQuery = () => {
      let q = supabase
        .from('role_audit_log')
        .select('action_type, actor_name, actor_user_id')
        .gte('created_at', cutoff);

      if (actionTypes.length > 0) {
        q = q.in('action_type', actionTypes);
      }
      if (actorId) {
        q = q.eq('actor_user_id', actorId);
      }
      if (search) {
        q = q.ilike('description', `%${search}%`);
      }
      return q;
    };

    const { data: statsRows, error: statsError } = await buildStatsQuery();

    let byActionType: Record<string, number> = {};
    let topActors: Array<{ actorName: string; count: number }> = [];

    if (!statsError && statsRows) {
      // Compute byActionType
      const actionTypeCounts: Record<string, number> = {};
      const actorCounts: Record<string, number> = {};

      for (const row of statsRows as Array<{
        action_type: string;
        actor_name: string | null;
        actor_user_id: string | null;
      }>) {
        // byActionType
        actionTypeCounts[row.action_type] =
          (actionTypeCounts[row.action_type] ?? 0) + 1;

        // topActors — key by actor_user_id when available, else by name
        const actorKey = row.actor_user_id ?? row.actor_name ?? 'System';
        if (!actorCounts[actorKey]) {
          actorCounts[actorKey] = 0;
        }
        actorCounts[actorKey] += 1;
      }

      byActionType = actionTypeCounts;

      // Build actorName → count, capping at top 5
      // We need the display name, not the UUID key. Build a secondary map.
      const actorKeyToName: Record<string, string> = {};
      for (const row of statsRows as Array<{
        action_type: string;
        actor_name: string | null;
        actor_user_id: string | null;
      }>) {
        const actorKey = row.actor_user_id ?? row.actor_name ?? 'System';
        if (!actorKeyToName[actorKey]) {
          actorKeyToName[actorKey] = row.actor_name ?? 'System';
        }
      }

      topActors = Object.entries(actorCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([key, cnt]) => ({
          actorName: actorKeyToName[key] ?? key,
          count: cnt,
        }));
    } else if (statsError) {
      console.warn('[permissions-audit/activity] Stats query error (non-fatal):', statsError);
    }

    // ── Transform rows snake_case → camelCase ────────────────────────────────
    const entries: ActivityEntry[] = (rows ?? []).map((row: RoleAuditLogRow) => ({
      id: row.id,
      actionType: row.action_type,
      actorName: row.actor_name ?? null,
      actorUserId: row.actor_user_id ?? null,
      targetUserId: row.target_user_id ?? null,
      targetRoleId: row.target_role_id ?? null,
      description: row.description,
      affectedUserCount: row.affected_user_count ?? 0,
      oldValue: row.old_value ?? null,
      newValue: row.new_value ?? null,
      createdAt: row.created_at,
    }));

    const response: ActivityResponse = {
      entries,
      stats: {
        total: totalCount,
        byActionType,
        topActors,
      },
      pagination: {
        page,
        pageSize,
        totalPages,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[permissions-audit/activity] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
