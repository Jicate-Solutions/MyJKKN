// app/api/admission/enquiries/[id]/checklist/route.ts
//
// Enquiry-side Checklist tab driver.
//   GET   resolve hierarchy → return aggregated items + per-learner status
//   POST  toggle a single item's done state ({ item_id, is_done })
//
// Both calls delegate to SECURITY DEFINER RPCs that bake the permission
// check inside the function. We still gate at the route boundary to fail
// fast and return clean HTTP 403s for the UI.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ChecklistRow {
  checklist_id: string;
  checklist_name: string;
  checklist_desc: string | null;
  scope_type: 'institution' | 'degree' | 'department' | 'program';
  scope_label: string | null;
  item_id: string;
  item_title: string;
  item_description: string | null;
  is_required: boolean;
  order_index: number;
  is_done: boolean;
  marked_by: string | null;
  marked_by_name: string | null;
  marked_at: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: learnerProfileId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canView } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.enquiries.checklist.view',
  });
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await (supabase as any).rpc('get_learner_checklist', {
    p_learner_id: learnerProfileId,
  });

  if (error) {
    console.error('[enquiry-checklist GET] RPC failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  // Group rows by checklist for cleaner client-side rendering.
  const rows = (data ?? []) as ChecklistRow[];
  const groups = new Map<string, {
    checklist_id: string;
    checklist_name: string;
    checklist_desc: string | null;
    scope_type: string;
    scope_label: string | null;
    items: Array<{
      item_id: string;
      item_title: string;
      item_description: string | null;
      is_required: boolean;
      order_index: number;
      is_done: boolean;
      marked_by: string | null;
      marked_by_name: string | null;
      marked_at: string | null;
    }>;
  }>();

  for (const r of rows) {
    let g = groups.get(r.checklist_id);
    if (!g) {
      g = {
        checklist_id: r.checklist_id,
        checklist_name: r.checklist_name,
        checklist_desc: r.checklist_desc,
        scope_type: r.scope_type,
        scope_label: r.scope_label,
        items: [],
      };
      groups.set(r.checklist_id, g);
    }
    g.items.push({
      item_id: r.item_id,
      item_title: r.item_title,
      item_description: r.item_description,
      is_required: r.is_required,
      order_index: r.order_index,
      is_done: r.is_done,
      marked_by: r.marked_by,
      marked_by_name: r.marked_by_name,
      marked_at: r.marked_at,
    });
  }

  return NextResponse.json({ groups: Array.from(groups.values()) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: learnerProfileId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Route-level fast-fail. The RPC re-checks inside as defense in depth.
  const { data: canMark } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.enquiries.checklist.mark',
  });
  if (!canMark) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { item_id?: string; is_done?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  if (typeof body.is_done !== 'boolean') return NextResponse.json({ error: 'is_done must be boolean' }, { status: 400 });

  const { data, error } = await (supabase as any).rpc('mark_checklist_item', {
    p_learner_id: learnerProfileId,
    p_item_id: body.item_id,
    p_is_done: body.is_done,
  });

  if (error) {
    console.error('[enquiry-checklist POST] RPC failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: data });
}
