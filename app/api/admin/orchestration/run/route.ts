// app/api/admin/orchestration/run/route.ts
//
// POST /api/admin/orchestration/run  { moduleKey: string }
//
// The Orchestration Console's one action in Phase 1: "Run AI" for a module.
// Every call writes an orchestration_actions row first (kind='run_ai',
// status='pending') — that row is the audit trail regardless of what happens
// next. This route NEVER merges or deploys anything; that's Phase 2.
//
// Wiring: this reuses the exact CRON_SECRET-as-Bearer-header pattern from
// app/api/admin/ai-routines/trigger/route.ts, resolving a routine from the
// SAME static registry (lib/ai-routines/registry.ts) by the convention
// `orchestration-run-ai-<moduleKey>`. No such registry entries exist yet —
// per the spec's open decision #2 (artifacts/orchestration-console-spec.html,
// section 11), whether "Run AI" reuses the fleet or a dedicated routine is
// still the Director's call, and is explicitly "none blocking Phase 1". So
// today this always falls through to the safe path: the action is logged as
// 'queued' and the route returns that honestly — it does not invent a new
// trigger mechanism. Once a matching routine is registered (Phase 2 follow-up),
// this same code path fires it for real, no route changes needed.
//
// RBAC: super_admin only — same gate as every other orchestration route.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRoutineById } from '@/lib/ai-routines/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  await connection();

  // 1) super_admin gate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  if (!isSuper) {
    return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
  }

  // 2) parse + validate the module
  let moduleKey = '';
  try {
    const body = await request.json();
    moduleKey = String(body?.moduleKey ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!moduleKey) {
    return NextResponse.json({ ok: false, error: 'moduleKey is required' }, { status: 400 });
  }
  const { data: moduleRow } = await supabase
    .from('orchestration_modules')
    .select('key, title')
    .eq('key', moduleKey)
    .maybeSingle();
  if (!moduleRow) {
    return NextResponse.json({ ok: false, error: `Unknown module: ${moduleKey}` }, { status: 404 });
  }

  // 3) write the audit row FIRST — this is the record of the button press,
  // independent of whether a real routine ends up firing.
  const { data: actionRow, error: insertError } = await supabase
    .from('orchestration_actions')
    .insert({ kind: 'run_ai', target: moduleKey, actor_id: user.id, status: 'pending' })
    .select('id')
    .single();
  if (insertError || !actionRow) {
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? 'Failed to record the action' },
      { status: 500 },
    );
  }

  // 4) attempt the real trigger, same pattern as ai-routines/trigger. Falls
  // through to 'queued' whenever no matching routine is registered — which is
  // the case for every module today.
  const routine = getRoutineById(`orchestration-run-ai-${moduleKey}`);
  if (!routine || routine.type !== 'cron' || !routine.safeToManualTrigger) {
    await supabase
      .from('orchestration_actions')
      .update({
        status: 'queued',
        result: {
          note:
            'No orchestration AI routine is registered for this module yet. The action is logged; ' +
            'wiring a real trigger is a Phase 1 follow-up (spec section 11, open decision #2).',
        },
      })
      .eq('id', actionRow.id);
    return NextResponse.json({
      ok: true,
      status: 'queued',
      actionId: actionRow.id,
      message: `Run AI for "${moduleRow.title}" was logged as queued — no routine is wired to fire yet.`,
    });
  }

  const secret = process.env.CRON_SECRET;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (!secret || !origin) {
    await supabase
      .from('orchestration_actions')
      .update({ status: 'failed', result: { error: 'CRON_SECRET or app origin not configured' } })
      .eq('id', actionRow.id);
    return NextResponse.json({ ok: false, error: 'Trigger not configured on the server' }, { status: 500 });
  }

  const target = `${origin}${routine.triggerPath}`;
  const startedAt = Date.now();
  try {
    const resp = await fetch(target, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    });
    const text = await resp.text();
    let result: unknown = null;
    try {
      result = JSON.parse(text);
    } catch {
      result = text.slice(0, 2000);
    }
    const status = resp.ok ? 'triggered' : 'failed';
    await supabase
      .from('orchestration_actions')
      .update({ status, result: { http_status: resp.status, elapsed_ms: Date.now() - startedAt, result } })
      .eq('id', actionRow.id);
    console.warn(
      `[orchestration/run] super_admin ${user.id} ran "${moduleKey}" via routine "${routine.id}" → HTTP ${resp.status}`,
    );
    return NextResponse.json({ ok: resp.ok, status, actionId: actionRow.id }, { status: resp.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'trigger failed';
    await supabase
      .from('orchestration_actions')
      .update({ status: 'failed', result: { error: message } })
      .eq('id', actionRow.id);
    return NextResponse.json({ ok: false, error: message, actionId: actionRow.id }, { status: 502 });
  }
}
