// =====================================================================
// AI Pulse — Domain Starter self-improving prompt loop: measure cron.
// =====================================================================
// The feed-forward half of the loop. A day or two after each cycle's packs
// ship, this closes the outcome ledger: for every starter still measure_status
// = 'pending', fn_ai_pulse_measure_domain_starters rolls the topic's cycle
// attendees up to their departments, reads the LIVE ai_pulse_cycle_outcomes
// lift (the ONE spine — never a parallel signal), and stamps the starter as
// measured (or 'insufficient' when the dept sample is too small to trust).
//
// That stamped lift is what next cycle's generation prompt reads back as the
// self-improvement hinge ("last time this prompt was copied by N students and
// engagement rose/dropped"), so a starter that went unused rewrites sharper.
//
// DARK until the kill switch domain_starter_enabled flips true (ai_pulse_policies).
// Tiny + idempotent: only 'pending' starters are touched, so a re-run is a no-op.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Optional `?cycle=<uuid>` scopes the measure to one cycle (else all pending).
// Created: 2026-07-20.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const ENABLED_KEY = 'domain_starter_enabled';

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

  // Kill switch. DARK until an admin flips domain_starter_enabled = true.
  const enabled = (await readPolicy(admin, ENABLED_KEY)) === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, note: 'domain starter loop is off (dark)' });
  }

  // Optional single-cycle scope; null measures all pending starters.
  const cycleId = request.nextUrl.searchParams.get('cycle');

  const { data, error } = await admin.rpc('fn_ai_pulse_measure_domain_starters', {
    p_cycle_id: cycleId,
  });
  if (error) {
    console.error('[cron/aipulse-domain-starter-measure] measure failed:', error.message);
    return NextResponse.json({ ok: false, enabled: true, error: error.message }, { status: 500 });
  }

  // RETURNS TABLE(measured int, insufficient int) → .rpc() yields an array row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { measured?: number; insufficient?: number }
    | null;
  const measured = Number(row?.measured ?? 0);
  const insufficient = Number(row?.insufficient ?? 0);

  return NextResponse.json({
    ok: true,
    enabled: true,
    cycle_id: cycleId,
    measured,
    insufficient,
    elapsed_ms: Date.now() - started,
  });
}
