import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/admin/notifications/audiences
 * List all active saved audiences. Any authenticated user can read.
 */
export async function GET(_request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE }
      );
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
 */
export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE }
      );
    }

    // Require super_admin for writes
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = profileData as { role: string } | null;

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        { status: 403, headers: NO_STORE }
      );
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

    if (query_type !== 'sql' && query_type !== 'built_in') {
      return NextResponse.json(
        { error: "query_type must be 'sql' or 'built_in'" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!query_params || typeof query_params !== 'object') {
      return NextResponse.json(
        { error: 'query_params is required' },
        { status: 400, headers: NO_STORE }
      );
    }

    if (query_type === 'sql') {
      if (!query_params.sql || typeof query_params.sql !== 'string' || !query_params.sql.trim()) {
        return NextResponse.json(
          { error: "query_params.sql is required when query_type is 'sql'" },
          { status: 400, headers: NO_STORE }
        );
      }
      // Note: SQL injection protection — only super_admins can create sql audiences,
      // and the auth check above enforces that. The resolve_audience DB function
      // executes the SQL in a restricted context.
    } else {
      // built_in
      if (!query_params.name || typeof query_params.name !== 'string') {
        return NextResponse.json(
          { error: "query_params.name is required when query_type is 'built_in'" },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    const insertPayload: any = {
      name: name.trim(),
      description: description || null,
      icon: icon || null,
      query_type,
      query_params,
      is_active: true,
      created_by: user.id
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
