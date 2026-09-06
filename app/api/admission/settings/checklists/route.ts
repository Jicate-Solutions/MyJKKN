// app/api/admission/settings/checklists/route.ts
//
// Programme-checklists admin endpoint.
//   GET    /api/admission/settings/checklists?scope_type=program&scope_id=<uuid>
//          List checklists for a scope (filters optional → all)
//   POST   create a new checklist
//
// Permissions:
//   GET   → admission.settings.checklists.view
//   POST  → admission.settings.checklists.manage

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

type ScopeType = 'institution' | 'degree' | 'department' | 'program';
const VALID_SCOPES: ScopeType[] = ['institution', 'degree', 'department', 'program'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canView } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.view',
  });
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const scope_type = url.searchParams.get('scope_type') as ScopeType | null;
  const scope_id = url.searchParams.get('scope_id');
  const include_inactive = url.searchParams.get('include_inactive') === 'true';

  const svc = createServiceRoleClient();
  let q = (svc as any)
    .from('admission_checklists')
    .select('id, scope_type, scope_id, name, description, applies_to_lifecycle, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (!include_inactive) q = q.eq('is_active', true);
  if (scope_type && VALID_SCOPES.includes(scope_type)) q = q.eq('scope_type', scope_type);
  if (scope_id) q = q.eq('scope_id', scope_id);

  const { data, error } = await q;
  if (error) {
    console.error('[checklists GET] failed:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // Pull item counts in a single grouped query, then merge in JS.
  const checklistIds = (data ?? []).map((c: { id: string }) => c.id);
  const itemCountsById = new Map<string, number>();
  if (checklistIds.length > 0) {
    const { data: itemRows } = await (svc as any)
      .from('admission_checklist_items')
      .select('checklist_id')
      .in('checklist_id', checklistIds)
      .eq('is_active', true);
    for (const row of (itemRows ?? []) as Array<{ checklist_id: string }>) {
      itemCountsById.set(row.checklist_id, (itemCountsById.get(row.checklist_id) ?? 0) + 1);
    }
  }

  // Resolve scope_label (target entity's human name) server-side. Group the
  // scope_ids by their scope_type, then fire one query per table. Way better
  // than the previous client-side hook-lookup, which raced page-load and
  // could leave UUIDs visible until the cache populated.
  const idsByType: Record<string, string[]> = { institution: [], degree: [], department: [], program: [] };
  for (const c of (data ?? []) as Array<{ scope_type: string; scope_id: string }>) {
    idsByType[c.scope_type]?.push(c.scope_id);
  }
  const labelById = new Map<string, string>();
  const fetches: Array<Promise<unknown>> = [];
  if (idsByType.institution.length) {
    fetches.push((svc as any).from('institutions').select('id, name').in('id', idsByType.institution)
      .then(({ data: rows }: { data: Array<{ id: string; name: string }> | null }) => {
        for (const r of rows ?? []) labelById.set(r.id, r.name);
      }));
  }
  if (idsByType.degree.length) {
    fetches.push((svc as any).from('degrees').select('id, degree_name, display_name').in('id', idsByType.degree)
      .then(({ data: rows }: { data: Array<{ id: string; degree_name: string; display_name: string | null }> | null }) => {
        for (const r of rows ?? []) labelById.set(r.id, r.display_name || r.degree_name);
      }));
  }
  if (idsByType.department.length) {
    fetches.push((svc as any).from('departments').select('id, department_name, display_name').in('id', idsByType.department)
      .then(({ data: rows }: { data: Array<{ id: string; department_name: string; display_name: string | null }> | null }) => {
        for (const r of rows ?? []) labelById.set(r.id, r.display_name || r.department_name);
      }));
  }
  if (idsByType.program.length) {
    fetches.push((svc as any).from('programs').select('id, program_name, display_name').in('id', idsByType.program)
      .then(({ data: rows }: { data: Array<{ id: string; program_name: string; display_name: string | null }> | null }) => {
        for (const r of rows ?? []) labelById.set(r.id, r.display_name || r.program_name);
      }));
  }
  await Promise.all(fetches);

  const enriched = (data ?? []).map((c: { id: string; scope_id: string }) => ({
    ...c,
    items_count: itemCountsById.get(c.id) ?? 0,
    scope_label: labelById.get(c.scope_id) ?? null,
  }));

  return NextResponse.json({ checklists: enriched });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: 'admission.settings.checklists.manage',
  });
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: {
    scope_type?: ScopeType;
    scope_id?: string;
    name?: string;
    description?: string | null;
    applies_to_lifecycle?: string[];
    items?: Array<{ title: string; is_required?: boolean; description?: string | null }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.scope_type || !VALID_SCOPES.includes(body.scope_type)) {
    return NextResponse.json({ error: 'scope_type must be one of institution/degree/department/program' }, { status: 400 });
  }
  if (!body.scope_id) return NextResponse.json({ error: 'scope_id required' }, { status: 400 });
  if (!body.name || !body.name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data: inserted, error } = await (svc as any)
    .from('admission_checklists')
    .insert({
      scope_type: body.scope_type,
      scope_id: body.scope_id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      applies_to_lifecycle: body.applies_to_lifecycle ?? ['lead', 'admitted', 'enrolled'],
      created_by: user.id,
    })
    .select('id, scope_type, scope_id, name, description, applies_to_lifecycle, is_active, created_at')
    .single();

  if (error) {
    console.error('[checklists POST] failed:', error);
    return NextResponse.json({ error: error.message ?? 'Server error' }, { status: 500 });
  }

  // Optionally insert items in the same call. Filter out blank titles so a
  // half-filled form row doesn't create an empty item.
  const itemsInput = (body.items ?? [])
    .filter((it) => it.title && it.title.trim().length > 0)
    .map((it, idx) => ({
      checklist_id: inserted.id,
      title: it.title.trim(),
      description: it.description?.trim() || null,
      is_required: it.is_required ?? false,
      order_index: idx,
    }));

  let itemsCreated = 0;
  if (itemsInput.length > 0) {
    const { error: itemsErr, count } = await (svc as any)
      .from('admission_checklist_items')
      .insert(itemsInput, { count: 'exact' });
    if (itemsErr) {
      console.error('[checklists POST] items insert failed:', itemsErr);
      // Best-effort: checklist already exists; we return it but flag the
      // items failure so the client can surface a partial-success toast.
      return NextResponse.json(
        { checklist: inserted, itemsError: itemsErr.message ?? 'Items insert failed' },
        { status: 207 },
      );
    }
    itemsCreated = count ?? itemsInput.length;
  }

  return NextResponse.json({ checklist: inserted, itemsCreated });
}
