import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/admin/notifications/audiences/[id]
 * Get a single saved audience with its resolved user count.
 * Any authenticated user can read.
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

    const { data: audience, error } = await (supabase as any)
      .from('notification_audiences')
      .select(
        'id, name, description, icon, query_type, query_params, is_active, created_by, created_at, updated_at'
      )
      .eq('id', id)
      .single();

    if (error || !audience) {
      return NextResponse.json(
        { error: 'Audience not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    // Resolve audience to get a count (do not fail the whole request if this errors)
    let count = 0;
    try {
      const { data: resolveData, error: resolveError } = await (supabase as any).rpc(
        'resolve_audience',
        { p_audience_id: id }
      );

      if (resolveError) {
        console.warn(
          '[notifications/audiences/:id] resolve_audience failed:',
          resolveError
        );
      } else if (resolveData) {
        if (Array.isArray(resolveData)) {
          count = resolveData.length;
        } else if (Array.isArray(resolveData?.user_ids)) {
          count = resolveData.user_ids.length;
        } else if (typeof resolveData?.count === 'number') {
          count = resolveData.count;
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
      updates.name = updates.name.trim();
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
      if (!updates.query_params || typeof updates.query_params !== 'object') {
        return NextResponse.json(
          { error: 'query_params must be an object' },
          { status: 400, headers: NO_STORE }
        );
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
