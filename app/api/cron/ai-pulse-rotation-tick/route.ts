// =====================================================================
// AI Pulse Rotation-Engine Cron — Lane D (SOP §2)
// =====================================================================
// Draws the upcoming cycle's Pulse teams from each section's rotation
// queue (ai_pulse_rotation_state) — front of queue → this week's teams,
// drawn learners → back of queue. "Everyone gets a turn."
//
// Logic:
//   1. Authorize via CRON_SECRET (Authorization: Bearer ... or ?secret=)
//   2. Read ai_pulse_policies: rotation_auto_generate (master switch) +
//      rotation_generation_dow (which day the draw happens)
//   3. Gate: skip unless today is the generation day (?force=1 bypasses
//      the day gate only — never the master switch)
//   4. Find the upcoming cycle (config->>kind='ai_pulse', demo_date >= today)
//   5. RotationEngineService.generateTeamsForCycle — idempotent per
//      (cycle, section); re-runs are no-ops for already-drawn sections
//
// Vercel cron line (reconciler adds to vercel.json — DO NOT edit here):
//   {"path":"/api/cron/ai-pulse-rotation-tick?secret=$CRON_SECRET","schedule":"37 2 * * *"}
//
// Pattern reference: app/api/cron/ai-pulse-tick/route.ts (auth + policy read).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { RotationEngineService } from '@/lib/services/ai-pulse/rotation-engine-service';

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (Vercel cron sends as Authorization header) ----
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  // -- 1. Read engine gate policies ---------------------------------------
  const { data: policiesRaw, error: policiesError } = await (supabase as any)
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('is_active', true);
  if (policiesError) {
    return NextResponse.json(
      { error: 'Failed to read ai_pulse_policies', detail: policiesError.message },
      { status: 500 }
    );
  }
  const policies = (policiesRaw || []) as PolicyRow[];

  const autoGenerate = readPolicy<boolean>(policies, 'rotation_auto_generate', true);
  const generationDow = readPolicy<string>(
    policies,
    'rotation_generation_dow',
    'Friday'
  );

  if (!autoGenerate) {
    // `skipped` here is a REASON STRING, not a count — summarize() ignores
    // non-numeric values, so `processed: 0` is what makes the no-op visible.
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: 'auto_generate_disabled',
      detail: 'rotation_auto_generate policy is off — no teams drawn.',
    });
  }

  // -- 2. Day-of-week gate (the daily 02:37 UTC tick == same IST weekday) --
  const now = new Date();
  const todayName = DAY_NAMES[now.getUTCDay()];
  const force = req.nextUrl.searchParams.get('force') === '1';
  if (todayName !== generationDow && !force) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: 'not_generation_day',
      today: todayName,
      generation_day: generationDow,
    });
  }

  // -- 3. Upcoming AI Pulse cycle ------------------------------------------
  const todayISO = now.toISOString().split('T')[0];
  const { data: cycles, error: cycleErr } = await (supabase as any)
    .from('startup_events')
    .select('id, name, demo_date')
    .filter('config->>kind', 'eq', 'ai_pulse')
    .gte('demo_date', todayISO)
    .order('demo_date', { ascending: true })
    .limit(1);
  if (cycleErr) {
    return NextResponse.json(
      { error: 'Failed to find upcoming cycle', detail: cycleErr.message },
      { status: 500 }
    );
  }
  const cycle = (cycles ?? [])[0];
  if (!cycle) {
    return NextResponse.json({ ok: true, processed: 0, skipped: 'no_upcoming_cycle' });
  }

  // -- 4. Run the engine -----------------------------------------------------
  try {
    const summary = await RotationEngineService.generateTeamsForCycle(
      supabase,
      cycle.id
    );
    // Top-level numeric keys for ai-routine-dispatcher's summarize() — it reads
    // only top-level allowlisted numerics, so nesting them under `summary` left
    // the Control Tower showing a bare "HTTP 200". `summary` kept for consumers.
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      processed: summary.sections_processed,
      created: summary.created,
      skipped: summary.skipped,
      summary,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: 'Rotation generation failed',
        detail: e instanceof Error ? e.message : 'unknown error',
        cycle_id: cycle.id,
      },
      { status: 500 }
    );
  }
}
