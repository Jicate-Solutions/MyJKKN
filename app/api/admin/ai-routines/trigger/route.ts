// ============================================================================
// AI ROUTINES — manual "Run now" trigger (super_admin only)
// ============================================================================
// Created: 2026-07-01. Backs the /admin/ai-routines control page.
//
// POST { routineId } → resolves the routine in the static registry and, if it is
// a cron flagged SAFE to fire on demand, invokes its cron path server-side with
// CRON_SECRET. Guardrails:
//   - super_admin only (mirrors /api/admin/ai-models RBAC exactly).
//   - only registered AI routines (arbitrary crons are not reachable).
//   - only type 'cron' AND safeToManualTrigger; message-sending / non-idempotent
//     routines are refused (403) — fire those from their own screen.
//   - CRON_SECRET never leaves the server and is passed as a Bearer header (NOT a
//     URL query param — sensitive data must not sit in URLs).
//   - the cron is called on the deployed origin (absolute URL) to avoid the
//     Next.js self-fetch-to-own-/api HTML-404 trap.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRoutineById } from '@/lib/ai-routines/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  await connection();

  // 1) super_admin gate (server-side; this fires a cron, so it must be tight)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  if (!isSuper) {
    return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
  }

  // 2) resolve the routine from the registry (only AI routines are reachable)
  let routineId = '';
  try {
    const body = await request.json();
    routineId = String(body?.routineId ?? '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const routine = getRoutineById(routineId);
  if (!routine) {
    return NextResponse.json({ ok: false, error: `Unknown routine: ${routineId}` }, { status: 404 });
  }

  // 3) only crons that are safe to fire on demand
  if (routine.type !== 'cron') {
    return NextResponse.json(
      { ok: false, error: 'Only scheduled (cron) routines can be run from here.' },
      { status: 400 },
    );
  }
  if (!routine.safeToManualTrigger) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'This routine sends messages or is not safe to fire twice — run it from its own screen instead.',
      },
      { status: 403 },
    );
  }

  // 4) fire it — absolute origin + CRON_SECRET as a Bearer header
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  // Origin MUST come from a configured env var — no request-derived fallback, so
  // the CRON_SECRET Bearer can never follow a request-influenced (spoofable) host.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (!origin) {
    return NextResponse.json(
      { ok: false, error: 'App origin not configured (NEXT_PUBLIC_APP_URL)' },
      { status: 500 },
    );
  }
  const target = `${origin}${routine.triggerPath}`;

  const startedAt = Date.now();
  try {
    const resp = await fetch(target, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000), // bound a hung cron target
    });
    const text = await resp.text();
    let result: unknown = null;
    try {
      result = JSON.parse(text);
    } catch {
      result = text.slice(0, 2000);
    }
    console.warn(
      `[ai-routines/trigger] super_admin ${user.id} ran "${routineId}" → HTTP ${resp.status} in ${Date.now() - startedAt}ms`,
    );
    return NextResponse.json(
      {
        ok: resp.ok,
        routineId,
        name: routine.name,
        status: resp.status,
        elapsed_ms: Date.now() - startedAt,
        result,
      },
      { status: resp.ok ? 200 : 502 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, routineId, error: err instanceof Error ? err.message : 'trigger failed' },
      { status: 502 },
    );
  }
}
