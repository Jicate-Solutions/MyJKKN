import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { VALID_BUILT_IN_AUDIENCE_NAMES } from '@/types/notifications';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

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
      error: NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        { status: 403, headers: NO_STORE }
      )
    };
  }

  return { user, error: null };
}

/**
 * GET /api/admin/notifications/audiences/[id]
 * Get a single saved audience with its resolved user count. super_admin only.
 * Deactivated audiences return 404 so clients cannot observe soft-deleted rows.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Audience id is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { error: authErrorResp } = await requireSuperAdmin(supabase);
    if (authErrorResp) {
      return authErrorResp;
    }

    const { data: audience, error } = await (supabase as any)
      .from('notification_audiences')
      .select(
        'id, name, description, icon, query_type, query_params, is_active, created_by, created_at, updated_at'
      )
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !audience) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    // Resolve audience to get a count (do not fail the whole request if this errors).
    // Uses service role because resolve_audience is SECURITY DEFINER and only
    // granted to service_role — the authenticated role cannot execute it.
    let count = 0;
    try {
      const serviceClient = createServiceRoleClient();
      const { data: resolveData, error: resolveError } = await (serviceClient as any).rpc(
        'resolve_audience',
        { p_audience_id: id }
      );

      if (resolveError) {
        console.warn(
          '[notifications/audiences/:id] resolve_audience failed:',
          resolveError
        );
      } else if (resolveData && typeof resolveData === 'object') {
        // Authoritative shape from the DB function: { user_ids: string[], count: number }
        if (typeof resolveData.count === 'number') {
          count = resolveData.count;
        } else if (Array.isArray(resolveData.user_ids)) {
          count = resolveData.user_ids.length;
        }
      }
    } catch (rpcErr) {
      console.warn(
        '[notifications/audiences/:id] resolve_audience threw:',
        rpcErr
      );
    }

    return NextResponse.json(
      { audience, count },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[notifications/audiences/:id] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * PUT /api/admin/notifications/audiences/[id]
 * Update a saved audience. super_admin only.
 *
 * Cross-field guard: if query_type changes, the final (query_type, query_params)
 * combination must still be valid — prevents leaving rows where a 'sql' type
 * has a built-in-style params object.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Audience id is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { error: authErrorResp } = await requireSuperAdmin(supabase);
    if (authErrorResp) {
      return authErrorResp;
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: NO_STORE }
      );
    }

    const allowed = [
      'name',
      'description',
      'icon',
      'query_type',
      'query_params',
      'is_active'
    ];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || !updates.name.trim()) {
        return NextResponse.json(
          { error: 'name must be a non-empty string' },
          { status: 400, headers: NO_STORE }
        );
      }
      if (updates.name.trim().length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
      updates.name = updates.name.trim();
    }

    if (updates.description !== undefined && updates.description !== null) {
      if (typeof updates.description !== 'string') {
        return NextResponse.json(
          { error: 'description must be a string' },
          { status: 400, headers: NO_STORE }
        );
      }
      if (updates.description.length > MAX_DESCRIPTION_LEN) {
        return NextResponse.json(
          { error: `description must be ${MAX_DESCRIPTION_LEN} characters or fewer` },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (updates.icon !== undefined && updates.icon !== null) {
      if (typeof updates.icon !== 'string' || !VALID_ICONS.has(updates.icon)) {
        return NextResponse.json(
          { error: 'icon must be one of the supported icon names' },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (updates.query_type !== undefined) {
      if (updates.query_type !== 'sql' && updates.query_type !== 'built_in') {
        return NextResponse.json(
          { error: "query_type must be 'sql' or 'built_in'" },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    if (updates.query_params !== undefined) {
      if (
        !updates.query_params ||
        typeof updates.query_params !== 'object' ||
        Array.isArray(updates.query_params)
      ) {
        return NextResponse.json(
          { error: 'query_params must be an object' },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    // Cross-field consistency: if either query_type or query_params was touched,
    // fetch the existing row so we can validate the combined end state.
    if (updates.query_type !== undefined || updates.query_params !== undefined) {
      const { data: existingRow, error: fetchErr } = await (supabase as any)
        .from('notification_audiences')
        .select('query_type, query_params')
        .eq('id', id)
        .single();

      if (fetchErr || !existingRow) {
        return NextResponse.json(
          { error: 'Audience not found' },
          { status: 404, headers: NO_STORE }
        );
      }

      const finalQueryType = updates.query_type ?? existingRow.query_type;
      const finalQueryParams = updates.query_params ?? existingRow.query_params;

      if (finalQueryType === 'sql') {
        const sql = finalQueryParams?.sql;
        if (!sql || typeof sql !== 'string' || !sql.trim()) {
          return NextResponse.json(
            {
              error:
                "query_params.sql is required when query_type is 'sql'. Update query_type and query_params together."
            },
            { status: 400, headers: NO_STORE }
          );
        }
        if (sql.length > MAX_SQL_LEN) {
          return NextResponse.json(
            { error: `query_params.sql must be ${MAX_SQL_LEN} characters or fewer` },
            { status: 400, headers: NO_STORE }
          );
        }
        // Normalize: when caller provided new query_params, strip extra keys.
        if (updates.query_params !== undefined) {
          updates.query_params = { sql: sql.trim() };
        }
      } else if (finalQueryType === 'built_in') {
        const bName = finalQueryParams?.name;
        if (!bName || typeof bName !== 'string') {
          return NextResponse.json(
            {
              error:
                "query_params.name is required when query_type is 'built_in'. Update query_type and query_params together."
            },
            { status: 400, headers: NO_STORE }
          );
        }
        if (!VALID_BUILT_IN_AUDIENCE_NAMES.includes(bName as any)) {
          return NextResponse.json(
            { error: `Unknown built-in audience type: ${bName}` },
            { status: 400, headers: NO_STORE }
          );
        }
        if (updates.query_params !== undefined) {
          updates.query_params = { name: bName };
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400, headers: NO_STORE }
      );
    }

    const { data, error } = await (supabase as any)
      .from('notification_audiences')
      .update(updates)
      .eq('id', id)
      .select(
        'id, name, description, icon, query_type, query_params, is_active, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      console.error('[notifications/audiences/:id] Failed to update audience:', error);
      return NextResponse.json(
        { error: 'Failed to update audience' },
        { status: 500, headers: NO_STORE }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { audience: data },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[notifications/audiences/:id] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}

/**
 * DELETE /api/admin/notifications/audiences/[id]
 * Soft-delete a saved audience by setting is_active = false.
 * super_admin only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Audience id is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { error: authErrorResp } = await requireSuperAdmin(supabase);
    if (authErrorResp) {
      return authErrorResp;
    }

    const { data, error } = await (supabase as any)
      .from('notification_audiences')
      .update({ is_active: false })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      console.error('[notifications/audiences/:id] Failed to delete audience:', error);
      return NextResponse.json(
        { error: 'Failed to delete audience' },
        { status: 500, headers: NO_STORE }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { success: true, id: data.id },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[notifications/audiences/:id] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}
