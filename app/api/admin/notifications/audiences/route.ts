import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// Accepted built-in audience condition names. MUST mirror the selectable
// options in audience-form.tsx — every <SelectItem value=...> that is NOT a
// disabled `_header_*` group label. The API previously imported the 3-name
// VALID_BUILT_IN_AUDIENCE_NAMES from types/notifications, which 400'd the other
// 10 conditions the UI has always offered (compliance-3).
const ACCEPTED_BUILT_IN_AUDIENCE_NAMES = [
  'all_active_users',
  'all_students',
  // College learners only — excludes the two schools. See migration
  // 20260804180000_college_learners_audience.sql.
  'college_students',
  'all_faculty',
  'all_hods',
  'role_filter',
  'institution_filter',
  'login_recency',
  'push_subscribers',
  'no_push',
  'attendance_below',
  'work_pulse_laggards',
  'hostel_residents',
  'bus_commuters'
] as const;

// Whitelist mirrors audience-form.tsx ICON_OPTIONS
const VALID_ICONS = new Set([
  'Users',
  'GraduationCap',
  'UserCog',
  'Briefcase',
  'Home',
  'Bus',
  'AlertTriangle',
  'Megaphone',
  'Shield'
]);

// Length caps — coordinated with audience-form.tsx zod schema
const MAX_NAME_LEN = 80;
const MAX_DESCRIPTION_LEN = 500;
const MAX_SQL_LEN = 4096;

async function requireSuperAdmin(supabase: any) {
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      user: null,
      profile: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE }
      )
    };
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { role: string } | null;

  if (profile?.role !== 'super_admin') {
    return {
      user,
      profile,
      error: NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        { status: 403, headers: NO_STORE }
      )
    };
  }

  return { user, profile, error: null };
}

/**
 * GET /api/admin/notifications/audiences
 * List all active saved audiences. Requires super_admin — audience query
 * payloads (especially custom SQL) are sensitive and must not leak to
 * regular authenticated users.
 */
export async function GET(_request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();

    const { error: authErrorResp } = await requireSuperAdmin(supabase);
    if (authErrorResp) {
      return authErrorResp;
    }

    const { data, error } = await (supabase as any)
      .from('notification_audiences')
      .select(
        'id, name, description, icon, query_type, query_params, is_active, created_by, created_at, updated_at'
      )
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[notifications/audiences] Failed to fetch audiences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch audiences' },
        { status: 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { audiences: data || [] },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[notifications/audiences] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * POST /api/admin/notifications/audiences
 * Create a new saved audience. super_admin only.
 *
 * Body: { name, description?, icon?, query_type, query_params }
 *
 * SECURITY NOTE: custom SQL audiences are executed by the `resolve_audience`
 * Postgres function which is SECURITY DEFINER and only granted to service_role.
 * A migration hardening resolve_audience (AST allowlist or removal of raw SQL
 * support) is tracked separately — the super_admin gate here is NOT a defense
 * against SQL injection, just against unauthorized creation.
 */
export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();

    const { user, error: authErrorResp } = await requireSuperAdmin(supabase);
    if (authErrorResp) {
      return authErrorResp;
    }

    // Parse and validate body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: NO_STORE }
      );
    }

    const isPreview = body?.preview === true;

    const { name, description, icon, query_type, query_params } = body || {};

    // Name is required for a real create; a preview needn't be named.
    if (!isPreview) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { error: 'name is required' },
          { status: 400, headers: NO_STORE }
        );
      }
      if (name.trim().length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
    } else if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        return NextResponse.json(
          { error: 'name must be a string' },
          { status: 400, headers: NO_STORE }
        );
      }
      if (name.trim().length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        return NextResponse.json(
          { error: 'description must be a string' },
          { status: 400, headers: NO_STORE }
        );
      }
      if (description.length > MAX_DESCRIPTION_LEN) {
        return NextResponse.json(
          { error: `description must be ${MAX_DESCRIPTION_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (icon !== undefined && icon !== null) {
      if (typeof icon !== 'string' || !VALID_ICONS.has(icon)) {
        return NextResponse.json(
          { error: 'icon must be one of the supported icon names' },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (query_type !== 'sql' && query_type !== 'built_in') {
      return NextResponse.json(
        { error: "query_type must be 'sql' or 'built_in'" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!query_params || typeof query_params !== 'object' || Array.isArray(query_params)) {
      return NextResponse.json(
        { error: 'query_params is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    // Normalize query_params. For built-in conditions we KEEP the full nested
    // params the UI sends (roles / institution_id / login-recency day count)
    // rather than collapsing to just { name } — the resolver needs them to
    // target the right users (compliance-4). Unknown/extra keys are still
    // dropped so callers can't tunnel arbitrary data into the jsonb blob.
    let normalizedParams: Record<string, any>;

    if (query_type === 'sql') {
      const sql = query_params.sql;
      if (!sql || typeof sql !== 'string' || !sql.trim()) {
        return NextResponse.json(
          { error: "query_params.sql is required when query_type is 'sql'" },
          { status: 400, headers: NO_STORE }
        );
      }
      if (sql.length > MAX_SQL_LEN) {
        return NextResponse.json(
          { error: `query_params.sql must be ${MAX_SQL_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
      normalizedParams = { sql: sql.trim() };
    } else {
      // built_in — whitelist the known condition names so typos / drift fail loudly
      const builtInName = query_params.name;
      if (!builtInName || typeof builtInName !== 'string') {
        return NextResponse.json(
          { error: "query_params.name is required when query_type is 'built_in'" },
          { status: 400, headers: NO_STORE }
        );
      }
      if (!ACCEPTED_BUILT_IN_AUDIENCE_NAMES.includes(builtInName as any)) {
        return NextResponse.json(
          {
            error: `Unknown built-in audience type: ${builtInName}. Supported: ${ACCEPTED_BUILT_IN_AUDIENCE_NAMES.join(', ')}`
          },
          { status: 400, headers: NO_STORE }
        );
      }

      normalizedParams = { name: builtInName };

      // Parametric conditions carry nested params that MUST be persisted.
      if (builtInName === 'role_filter') {
        const roles = Array.isArray(query_params.roles)
          ? query_params.roles.filter(
              (r: any): r is string => typeof r === 'string' && r.trim().length > 0
            )
          : [];
        if (roles.length === 0) {
          return NextResponse.json(
            {
              error:
                'query_params.roles must be a non-empty array of role keys for role_filter'
            },
            { status: 400, headers: NO_STORE }
          );
        }
        normalizedParams.roles = roles;
      } else if (builtInName === 'institution_filter') {
        const institutionId = query_params.institution_id;
        if (
          !institutionId ||
          typeof institutionId !== 'string' ||
          !institutionId.trim()
        ) {
          return NextResponse.json(
            {
              error:
                'query_params.institution_id is required for institution_filter'
            },
            { status: 400, headers: NO_STORE }
          );
        }
        normalizedParams.institution_id = institutionId.trim();
      } else if (builtInName === 'login_recency') {
        const hasNot = query_params.not_logged_in_days !== undefined;
        const hasIn = query_params.logged_in_within_days !== undefined;
        if (hasNot === hasIn) {
          return NextResponse.json(
            {
              error:
                'login_recency requires exactly one of not_logged_in_days or logged_in_within_days'
            },
            { status: 400, headers: NO_STORE }
          );
        }
        const key = hasNot ? 'not_logged_in_days' : 'logged_in_within_days';
        const days = Number(query_params[key]);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          return NextResponse.json(
            { error: `${key} must be an integer between 1 and 365` },
            { status: 400, headers: NO_STORE }
          );
        }
        normalizedParams[key] = days;
      }
    }

    // Preview mode (compliance-6): resolve membership WITHOUT persisting an
    // audience row and WITHOUT navigating. resolve_audience() only accepts a
    // saved audience id, so we go through resolve_audience_preview — a
    // transient-row wrapper (see migrationSql) that reuses the exact production
    // resolver and leaves no committed row behind. Uses the service client
    // because the resolver is SECURITY DEFINER, granted to service_role only.
    if (isPreview) {
      const serviceClient = createServiceRoleClient();
      const { data: resolveRaw, error: resolveError } = await serviceClient.rpc('resolve_audience_preview', {
        p_query_type: query_type,
        p_query_params: normalizedParams
      });

      if (resolveError) {
        console.error(
          '[notifications/audiences] resolve_audience_preview failed:',
          resolveError
        );
        return NextResponse.json(
          { error: 'Failed to preview audience' },
          { status: 500, headers: NO_STORE }
        );
      }

      // Authoritative shape from the DB function: { user_ids: string[], count: number }.
      // Assert the jsonb payload shape so the typed client needs no `as any`.
      const resolveData = resolveRaw as { user_ids?: string[]; count?: number } | null;
      let allUserIds: string[] = [];
      let totalCount = 0;
      if (resolveData && typeof resolveData === 'object') {
        if (Array.isArray(resolveData.user_ids)) {
          allUserIds = resolveData.user_ids.filter(
            (v: any): v is string => typeof v === 'string' && v.length > 0
          );
        }
        totalCount =
          typeof resolveData.count === 'number'
            ? resolveData.count
            : allUserIds.length;
      }
      allUserIds = [...new Set(allUserIds)];

      // Hydrate only the first 20 for display — never return the full id list.
      const previewIds = allUserIds.slice(0, 20);
      let previewUsers: Array<{
        id: string;
        full_name: string;
        email: string;
        role: string;
      }> = [];

      if (previewIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .in('id', previewIds);
        const rows = (profiles || []) as Array<{
          id: string;
          full_name: string | null;
          email: string | null;
          role: string | null;
        }>;
        previewUsers = rows.map((p) => ({
          id: p.id,
          full_name: p.full_name || 'Unknown',
          email: p.email || '',
          role: p.role || ''
        }));
      }

      return NextResponse.json(
        { count: totalCount, preview_users: previewUsers },
        { headers: NO_STORE }
      );
    }

    const insertPayload: any = {
      name: (name as string).trim(),
      description: description ? (description as string).trim() || null : null,
      icon: icon || null,
      query_type,
      query_params: normalizedParams,
      is_active: true,
      created_by: user!.id
    };

    const { data, error } = await (supabase as any)
      .from('notification_audiences')
      .insert(insertPayload)
      .select(
        'id, name, description, icon, query_type, query_params, is_active, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('[notifications/audiences] Failed to create audience:', error);
      return NextResponse.json(
        { error: 'Failed to create audience' },
        { status: 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { audience: data },
      { status: 201, headers: NO_STORE }
    );
  } catch (error) {
    console.error('[notifications/audiences] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}
