// app/api/admission/settings/checklists/[id]/items/[itemId]/route.ts
//   PATCH  update item fields
//   DELETE soft-delete if completions exist, hard otherwise

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { title?: string; description?: string | null; is_required?: boolean; order_index?: number; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (!body.title.trim()) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.is_required !== undefined) patch.is_required = body.is_required;
  if (body.order_index !== undefined) patch.order_index = body.order_index;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('admission_checklist_items')
    .update(patch)
    .eq('id', itemId)
    .select('id, title, description, order_index, is_required, is_active, updated_at')
    .single();

  if (error) {
    console.error('[checklist-item PATCH] failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceRoleClient();

  const { count } = await (svc as any)
    .from('admission_checklist_completions')
    .select('id', { count: 'exact', head: true })
    .eq('checklist_item_id', itemId);

  if ((count ?? 0) > 0) {
    const { error } = await (svc as any)
      .from('admission_checklist_items')
      .update({ is_active: false })
      .eq('id', itemId);
    if (error) {
      console.error('[checklist-item DELETE soft] failed:', error);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode: 'soft' });
  }

  const { error } = await (svc as any)
    .from('admission_checklist_items')
    .delete()
    .eq('id', itemId);
  if (error) {
    console.error('[checklist-item DELETE hard] failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: 'hard' });
}
