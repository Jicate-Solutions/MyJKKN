// app/api/admission/settings/checklists/[id]/items/route.ts
// Add an item to a checklist.
//   POST { title, description?, is_required?, order_index? }

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: checklistId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { title?: string; description?: string | null; is_required?: boolean; order_index?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  // Auto-pick next order_index when not provided
  let orderIndex = body.order_index;
  if (orderIndex === undefined) {
    const { data: tail } = await (svc as any)
      .from('admission_checklist_items')
      .select('order_index')
      .eq('checklist_id', checklistId)
      .eq('is_active', true)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    orderIndex = ((tail?.order_index as number | undefined) ?? -1) + 1;
  }

  const { data, error } = await (svc as any)
    .from('admission_checklist_items')
    .insert({
      checklist_id: checklistId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      is_required: body.is_required ?? false,
      order_index: orderIndex,
    })
    .select('id, title, description, order_index, is_required, is_active, created_at')
    .single();

  if (error) {
    console.error('[checklist-item POST] failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
