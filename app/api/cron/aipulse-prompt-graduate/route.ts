// =====================================================================
// AI Pulse — Learner-prompt graduation cron (decision #20).
// =====================================================================
// Promotes the best learner builds into the shared library: for every build
// still graduated_at IS NULL that is graded and clears the checklist score bar
// (prompt_graduation_min_score), fn_ai_pulse_graduate_prompt_builds stamps
// graduated_at so it surfaces to peers on the same topic (the compounding half
// of the moat: staff seed + learners grow it).
//
// DARK until the kill switch prompt_graduation_enabled flips true
// (ai_pulse_policies). The RPC itself is dark-gated too (defense-in-depth), so
// this is a no-op until an admin turns it on. Tiny + idempotent: only
// ungraduated, graded, passing builds are touched, so a re-run is a no-op.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Optional `?cycle=<uuid>` scopes the graduation to one cycle (else all).
// Created: 2026-07-23.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const ENABLED_KEY = 'prompt_graduation_enabled';

type Admin = ReturnType<typeof createServiceRoleClient>;

// Fail-safe config read: any error → null (treated as off), never throws.
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return (data as { value_jsonb?: unknown } | null)?.value_jsonb ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  // Kill switch. DARK until an admin flips prompt_graduation_enabled = true.
  const enabled = (await readPolicy(admin, ENABLED_KEY)) === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, note: 'prompt graduation is off (dark)' });
  }

  // Optional single-cycle scope; null graduates across all cycles.
  const cycleId = request.nextUrl.searchParams.get('cycle');

  const { data, error } = await admin.rpc('fn_ai_pulse_graduate_prompt_builds', {
    p_cycle_id: cycleId,
  });
  if (error) {
    console.error('[cron/aipulse-prompt-graduate] graduate failed:', error.message);
    return NextResponse.json({ ok: false, enabled: true, error: error.message }, { status: 500 });
  }

  // RPC RETURNS integer → .rpc() yields the scalar count.
  const graduated = Number((Array.isArray(data) ? data[0] : data) ?? 0);

  return NextResponse.json({
    ok: true,
    enabled: true,
    cycle_id: cycleId,
    graduated,
    elapsed_ms: Date.now() - started,
  });
}
