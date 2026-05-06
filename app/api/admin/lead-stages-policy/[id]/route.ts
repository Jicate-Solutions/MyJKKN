export const dynamic = 'force-dynamic';

// /api/admin/lead-stages-policy/[id]
// Phase 1C: Mutating endpoints for a single lead_active_stage_policy row.
// RBAC: super_admin only — checked server-side.
//
// PATCH  — update is_terminal and/or description only
//           (scope_type / institution_id / funnel_stage require delete-then-recreate)
// DELETE — remove the row

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { id } = await context.params;

    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const body = await request.json();

    // Guard: reject attempts to mutate immutable identity fields
    const immutableFields = ['scope_type', 'institution_id', 'funnel_stage', 'id', 'created_at', 'created_by'];
    const attempted = immutableFields.filter((f) => f in body);
    if (attempted.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot change ${attempted.join(', ')} on an existing policy. Delete the row and recreate it with the new values instead.`
        },
        { status: 400 }
      );
    }

    // Only allow is_terminal and description
    const updates: Record<string, unknown> = {};

    if ('is_terminal' in body) {
      if (typeof body.is_terminal !== 'boolean') {
        return NextResponse.json({ error: 'is_terminal must be a boolean' }, { status: 400 });
      }
      updates.is_terminal = body.is_terminal;
    }

    if ('description' in body) {
      updates.description = body.description ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields provided. You can update: is_terminal, description' },
        { status: 400 }
      );
    }

    updates.updated_by = auth.userId;
    // updated_at is handled by DB trigger / DEFAULT now() on update

    const { data: updated, error } = await auth.supabase
      .from('lead_active_stage_policy')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Stage policy not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[lead-stages-policy/[id]] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update stage policy' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { id } = await context.params;

    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    // Verify row exists before delete so we can return 404 vs 200
    const { data: existing, error: fetchError } = await auth.supabase
      .from('lead_active_stage_policy')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
      return NextResponse.json({ error: 'Stage policy not found' }, { status: 404 });
    }

    const { error } = await auth.supabase
      .from('lead_active_stage_policy')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[lead-stages-policy/[id]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete stage policy' }, { status: 500 });
  }
}
