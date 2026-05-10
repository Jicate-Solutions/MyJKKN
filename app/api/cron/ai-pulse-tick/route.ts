// =====================================================================
// AI Pulse Cycle-Generation Cron — Wave A.2
// =====================================================================
// Spec: specs/myjkkn-ai-pulse-spec.md v3 §6 (Wave A.2 cycle generation)
// Substrate: PR #644 — ai_pulse_policies + startup_events extension
// Permissions: PR #716 — aiPulse:* keys catalog
//
// Runs hourly (or per ai_pulse_policies.cron_tick_minutes). On Mondays
// at 08:00 IST it auto-creates the upcoming Thursday's cycle by
// inserting a row into startup_events with config.kind='ai_pulse'.
//
// Logic:
//   1. Authorize via CRON_SECRET (Authorization: Bearer ... or ?secret=)
//   2. Read ai_pulse_policies for: session_day, session_start_time,
//      session_end_time, gold_standard_count, primary_language, etc.
//   3. Compute the next session datetime for each institution
//   4. Idempotency check: skip if a startup_events row already exists
//      with config.kind='ai_pulse' AND demo_date=<thursday>
//   5. Insert new cycle row with config.kind discriminator + per-cycle
//      JSONB shape from §4.4
//
// Idempotency: safe to fire arbitrarily often. Worst case = no-op when
// cycle already exists for the upcoming Thursday.
//
// Pattern reference: app/api/cron/counselor-shift-flip/route.ts (auth
// shape) + app/api/cron/friday-reflection/route.ts (idempotency shape).
//
// Champion = Krishnaveni; Co-Champion = Ranjith. host_user_id default
// resolves to Krishnaveni's profile.id; cron does NOT decide between
// them — that's a Champion Console (B.1) concern. Cron creates the
// shell row; Champion fills in topic + featured tool + meet URL via UI.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

interface InstitutionRow {
  id: string;
  name: string;
}

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

/** Compute the upcoming Thursday's date (or today if today is Thursday). */
function nextThursday(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun, 4=Thu
  const offset = (4 - day + 7) % 7;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build the startup_events.config JSONB blob per spec §4.4 */
function buildCycleConfig(policies: PolicyRow[], thursdayISO: string) {
  return {
    kind: 'ai_pulse',
    cycle_week_start_date: thursdayISO,
    featured_tool_id: null, // Champion picks via UI
    briefing_topic_id: null, // Champion sets via UI
    host_user_id: null, // Champion Console assigns
    meet_url: null,
    recording_url: null,
    external_judge_cycle: false,
    gold_standard_count: readPolicy<number>(policies, 'gold_standard_count', 2),
    bottom_n_publication_count: readPolicy<number>(
      policies,
      'bottom_n_publication_count',
      2
    ),
    primary_language: readPolicy<string>(policies, 'primary_language', 'en'),
    secondary_language: readPolicy<string>(policies, 'secondary_language', 'ta'),
    session_start_time: readPolicy<string>(policies, 'session_start_time', '18:55'),
    session_end_time: readPolicy<string>(policies, 'session_end_time', '19:30'),
  };
}

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

  // -- 1. Read policies ---------------------------------------------------
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

  // -- 2. Compute upcoming Thursday --------------------------------------
  const thursday = nextThursday(new Date());
  const thursdayISO = thursday.toISOString().split('T')[0];

  // -- 3. List institutions to seed cycles for ---------------------------
  // Multi-campus mode: 'unified' = single row at JKKN parent;
  //                   'per_college' = one row per institution
  const multiCampusMode = readPolicy<string>(policies, 'multi_campus_mode', 'unified');

  let institutions: InstitutionRow[] = [];
  if (multiCampusMode === 'unified') {
    // Single cycle row — host_institution_id = first/parent institution.
    // For now, pick the institution with the most learners; can be refined
    // to a designated "JKKN parent" institution row later.
    const { data, error } = await (supabase as any)
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .limit(1);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to list institutions', detail: error.message },
        { status: 500 }
      );
    }
    institutions = (data || []) as InstitutionRow[];
  } else {
    // Per-college: one cycle per institution
    const { data, error } = await (supabase as any)
      .from('institutions')
      .select('id, name')
      .eq('is_active', true);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to list institutions', detail: error.message },
        { status: 500 }
      );
    }
    institutions = (data || []) as InstitutionRow[];
  }

  // -- 4. For each institution: idempotent insert ------------------------
  const results: Array<{
    institution_id: string;
    institution_name: string;
    action: 'created' | 'exists' | 'error';
    detail?: string;
  }> = [];

  for (const inst of institutions) {
    // Idempotency: does a cycle already exist for this institution + thursday?
    const { data: existing, error: existingError } = await (supabase as any)
      .from('startup_events')
      .select('id, config')
      .eq('host_institution_id', inst.id)
      .eq('demo_date', thursdayISO)
      .filter('config->>kind', 'eq', 'ai_pulse')
      .limit(1);

    if (existingError) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'error',
        detail: existingError.message,
      });
      continue;
    }
    if (existing && existing.length > 0) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'exists',
      });
      continue;
    }

    // Insert new cycle row
    const cycleConfig = buildCycleConfig(policies, thursdayISO);
    const { error: insertError } = await (supabase as any)
      .from('startup_events')
      .insert({
        name: `AI Pulse Cycle ${thursdayISO}`,
        host_institution_id: inst.id,
        status: 'draft',
        demo_date: thursdayISO,
        config: cycleConfig,
      });

    if (insertError) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'error',
        detail: insertError.message,
      });
    } else {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'created',
      });
    }
  }

  const summary = {
    multi_campus_mode: multiCampusMode,
    upcoming_thursday: thursdayISO,
    institutions_processed: institutions.length,
    created: results.filter((r) => r.action === 'created').length,
    existed: results.filter((r) => r.action === 'exists').length,
    errors: results.filter((r) => r.action === 'error').length,
    elapsed_ms: Date.now() - startedAt,
    results,
  };

  console.log('[cron/ai-pulse-tick]', summary);

  return NextResponse.json({ ok: true, summary });
}
