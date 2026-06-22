// app/api/cdc/udyog/mine/route.ts — the LEARNER's own UDYOG requirement(s)
// (BUG-004075, 4a). Surfaces the student's "apply via UDYOG + record reference"
// card on their dashboard. Companion to the staff /api/cdc/udyog routes.
//
// GET  → the caller's own active requirements + the external portal URL.
// POST → the caller advances THEIR OWN requirement: 'direct' (clicked the
//        outbound link) or 'apply' (reference number on file). NOT 'waive' —
//        only staff (cdc.udyog.manage) can waive.
//
// Ownership: the staff routes gate on cdc.udyog.manage, which students lack. A
// student instead may only ever touch a requirement whose learner_id maps to
// THEIR profile (profiles.learner_id). Reads/writes go through the service-role
// client after that ownership check, so there is no cross-learner exposure.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const PORTAL_URL_KEY = 'cdc.udyog.portal_url';

// Statuses a learner should still see on their dashboard (waived/cancelled are
// resolved and need no learner action).
const VISIBLE_STATUSES = ['required', 'directed', 'applied'];

async function callerLearnerId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('learner_id')
    .eq('id', userId)
    .single();
  return (data as { learner_id: string | null } | null)?.learner_id ?? null;
}

async function portalUrl(svc: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const { data } = await svc
    .from('platform_policies')
    .select('value')
    .eq('policy_key', PORTAL_URL_KEY)
    .eq('scope_type', 'global')
    .maybeSingle();
  const v = (data as { value: unknown } | null)?.value;
  return typeof v === 'string' ? v : '';
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const learnerId = await callerLearnerId(supabase, user.id);
  if (!learnerId) {
    // Not a learner (e.g. staff viewing the student dashboard) — nothing to show.
    return NextResponse.json({ requirements: [], portalUrl: '' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const svc = createServiceRoleClient();
  const [{ data: rows, error }, url] = await Promise.all([
    svc
      .from('cdc_udyog_requirements')
      .select('id, status, udyog_reference, due_date, directed_at, applied_at, source_programme_id, programme:source_programme_id(name)')
      .eq('learner_id', learnerId)
      .in('status', VISIBLE_STATUSES)
      .order('created_at', { ascending: false }),
    portalUrl(svc),
  ]);
  if (error) {
    console.error('[cdc/udyog/mine] read failed:', error.message);
    return NextResponse.json({ error: 'Could not load your UDYOG requirement.' }, { status: 500 });
  }

  return NextResponse.json(
    { requirements: rows ?? [], portalUrl: url },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? '').toString();
  const action = body?.action as string | undefined;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (!['direct', 'apply'].includes(action ?? '')) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const learnerId = await callerLearnerId(supabase, user.id);
  if (!learnerId) return NextResponse.json({ error: 'Only learners can update their UDYOG requirement.' }, { status: 403 });

  const svc = createServiceRoleClient();
  // Ownership check — the requirement must belong to THIS learner.
  const { data: existing, error: loadErr } = await svc
    .from('cdc_udyog_requirements')
    .select('id, learner_id, status')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !existing) return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
  if ((existing as { learner_id: string }).learner_id !== learnerId) {
    return NextResponse.json({ error: 'This is not your requirement.' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (action === 'direct') {
    // Idempotent: only stamp directed once, and never downgrade an applied row.
    if ((existing as { status: string }).status === 'required') {
      patch.status = 'directed';
      patch.directed_at = new Date().toISOString();
    } else {
      // Already directed/applied — nothing to change, return current row.
      const { data: cur } = await svc
        .from('cdc_udyog_requirements')
        .select('id, status, udyog_reference, directed_at, applied_at')
        .eq('id', id)
        .single();
      return NextResponse.json({ requirement: cur });
    }
  } else {
    // apply — reference number required (also enforced by DB CHECK).
    const ref = (body?.udyog_reference ?? '').toString().trim();
    if (!ref) {
      return NextResponse.json({ error: 'Enter your UDYOG reference number to mark applied.' }, { status: 400 });
    }
    patch.status = 'applied';
    patch.udyog_reference = ref;
    patch.applied_at = new Date().toISOString();
  }

  const { data: updated, error: updErr } = await svc
    .from('cdc_udyog_requirements')
    .update(patch)
    .eq('id', id)
    .select('id, status, udyog_reference, directed_at, applied_at')
    .single();
  if (updErr) {
    const msg = updErr.code === '23514'
      ? 'Enter your UDYOG reference number to mark applied.'
      : 'Could not update your requirement.';
    console.error('[cdc/udyog/mine] update failed:', updErr);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ requirement: updated });
}
