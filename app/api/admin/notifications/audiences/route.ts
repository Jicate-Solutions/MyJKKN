import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VALID_BUILT_IN_AUDIENCE_NAMES } from '@/types/notifications';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

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

    const { name, description, icon, query_type, query_params } = body || {};

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

    // Normalize query_params — only keep the field relevant to the query_type
    // so extra keys can't tunnel data into the jsonb blob.
    let normalizedParams: Record<string, string>;

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
      // built_in — whitelist the known handler names so typos / drift fail loudly
      const builtInName = query_params.name;
      if (!builtInName || typeof builtInName !== 'string') {
        return NextResponse.json(
          { error: "query_params.name is required when query_type is 'built_in'" },
          { status: 400, headers: NO_STORE }
        );
      }
      if (!VALID_BUILT_IN_AUDIENCE_NAMES.includes(builtInName as any)) {
        return NextResponse.json(
          {
            error: `Unknown built-in audience type: ${builtInName}. Supported: ${VALID_BUILT_IN_AUDIENCE_NAMES.join(', ')}`
          },
          { status: 400, headers: NO_STORE }
        );
      }
      normalizedParams = { name: builtInName };
    }

    const insertPayload: any = {
      name: name.trim(),
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
