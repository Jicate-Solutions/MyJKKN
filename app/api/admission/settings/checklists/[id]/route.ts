// app/api/admission/settings/checklists/[id]/route.ts
//
// Single-checklist endpoint with nested items.
//   GET    fetch checklist + its items (ordered)
//   PATCH  update name / description / lifecycle / is_active
//   DELETE soft-delete (is_active = false). Hard delete is reserved for
//          checklists that have never been used (no completions linked).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canView } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.view',
  });
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceRoleClient();
  const { data: checklist, error: clErr } = await (svc as any)
    .from('admission_checklists')
    .select('id, scope_type, scope_id, name, description, applies_to_lifecycle, is_active, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (clErr) {
    console.error('[checklist GET] failed:', clErr);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: items, error: itemsErr } = await (svc as any)
    .from('admission_checklist_items')
    .select('id, title, description, order_index, is_required, is_active, created_at, updated_at')
    .eq('checklist_id', id)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemsErr) {
    console.error('[checklist GET items] failed:', itemsErr);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ checklist, items: items ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: {
    name?: string;
    description?: string | null;
    applies_to_lifecycle?: string[];
    is_active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.applies_to_lifecycle !== undefined) patch.applies_to_lifecycle = body.applies_to_lifecycle;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('admission_checklists')
    .update(patch)
    .eq('id', id)
    .select('id, scope_type, scope_id, name, description, applies_to_lifecycle, is_active, updated_at')
    .single();

  if (error) {
    console.error('[checklist PATCH] failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ checklist: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceRoleClient();

  // Check if any item has ever been marked. If so, soft-delete to preserve
  // audit history. Otherwise hard-delete (cascade clears items).
  const { count } = await (svc as any)
    .from('admission_checklist_completions')
    .select('id', { count: 'exact', head: true })
    .in(
      'checklist_item_id',
      ((await (svc as any)
        .from('admission_checklist_items')
        .select('id')
        .eq('checklist_id', id)).data ?? []).map((r: { id: string }) => r.id),
    );

  if ((count ?? 0) > 0) {
    const { error } = await (svc as any)
      .from('admission_checklists')
      .update({ is_active: false })
      .eq('id', id);
    if (error) {
      console.error('[checklist DELETE soft] failed:', error);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode: 'soft' });
  }

  const { error } = await (svc as any)
    .from('admission_checklists')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[checklist DELETE hard] failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: 'hard' });
}
