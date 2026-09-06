// app/api/cdc/requirements/[id]/route.ts
// CDC staff — read one requirement (+roles), moderate/edit it, or delete it.
// RLS (is_cdc_staff + institution scope on write) is the source of truth; the
// explicit gate returns clear 401/403 instead of a silent empty/again.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { EmployerRequirementStatus } from '@/types/cdc/employer-requirements';

async function gate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, ok: false as const };
  const { data: isStaff } = await supabase.rpc('is_cdc_staff');
  return { user, ok: isStaff === true };
}

const MODERATION_STATUSES = new Set(['approved', 'rejected', 'closed', 'published']);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, ok } = await gate(supabase);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ok) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  const { data, error } = await supabase
    .from('cdc_employer_requirements')
    .select('*, roles:cdc_employer_requirement_roles(*)')
    .eq('id', id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, ok } = await gate(supabase);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ok) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  let body: { status?: EmployerRequirementStatus; review_notes?: string | null; [k: string]: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') {
    if (!MODERATION_STATUSES.has(body.status))
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    patch.status = body.status;
    patch.reviewed_by = user.id;
    patch.reviewed_at = new Date().toISOString();
  }
  if ('review_notes' in body) patch.review_notes = body.review_notes ?? null;
  // Allow light header edits by staff.
  for (const f of ['company_name', 'company_website', 'hq_city', 'hq_state',
    'primary_contact_name', 'primary_contact_email', 'primary_contact_phone',
    'secondary_contact_name', 'secondary_contact_phone'] as const) {
    if (f in body) patch[f] = body[f] ?? null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabase
    .from('cdc_employer_requirements')
    .update(patch)
    .eq('id', id)
    .select('id, status')
    .single();
  if (error) {
    console.error('[cdc/requirements PATCH] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, ok } = await gate(supabase);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ok) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  const { error } = await supabase.from('cdc_employer_requirements').delete().eq('id', id);
  if (error) {
    console.error('[cdc/requirements DELETE] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
