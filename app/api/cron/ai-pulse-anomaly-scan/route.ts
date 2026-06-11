// =====================================================================
// AI Pulse Anomaly Scan Cron — Pulse-to-Practice SOP §4 (governance)
// =====================================================================
// Writes ai_pulse_anomaly_flags rows (table from migration 20260502,
// flag_type CHECK-constrained — only the five allowed values are used).
// Reviewed by Champion/Co-Champion at /ai-pulse/admin/anomalies.
//
// Detectors (thresholds READ from ai_pulse_policies at runtime):
//   1. Quiz pass without attending — quiz_score >= quiz_pass_threshold_live
//      while joined_within_5min=false AND stayed_until missing on the
//      live_session attendance row (async make-up rows are exempt).
//      flag_type: 'intra_dept_scoring_outlier' (closest allowed value;
//      details_json.detector identifies the exact pattern).
//   2. Reach outlier — submission reach (active_users_count, the same field
//      naac-evidence-service reports as ig_reach) greater than
//      ig_reach_threshold * reach_outlier_multiplier (possible bought reach).
//      flag_type: 'ig_reach_inconsistent'.
//
// Idempotent: skips when an open (pending / unreviewed) flag of the same
// type already exists for the same target + cycle. Safe to fire often.
//
// Auth + shape copied from app/api/cron/ai-pulse-tick/route.ts
// (CRON_SECRET via Authorization header or ?secret=).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

/** How far back (days) the scan looks for cycles. Detection window only. */
const SCAN_WINDOW_DAYS = 14;

type FlagInsert = {
  startup_event_id: string;
  flag_type: 'intra_dept_scoring_outlier' | 'ig_reach_inconsistent';
  target_user_id: string | null;
  signal_value: number | null;
  signal_threshold: number | null;
  details_json: Record<string, unknown>;
};

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

  const quizPassThreshold = Number(
    readPolicy<number>(policies, 'quiz_pass_threshold_live', 40)
  );
  const igReachThreshold = Number(
    readPolicy<number>(policies, 'ig_reach_threshold', 500)
  );
  const reachOutlierMultiplier = Number(
    readPolicy<number>(policies, 'reach_outlier_multiplier', 20)
  );
  const reachOutlierThreshold = igReachThreshold * reachOutlierMultiplier;

  // -- 2. Recent AI Pulse cycles ------------------------------------------
  const since = new Date();
  since.setDate(since.getDate() - SCAN_WINDOW_DAYS);
  const sinceISO = since.toISOString().split('T')[0];

  const { data: cyclesRaw, error: cyclesError } = await (supabase as any)
    .from('startup_events')
    .select('id, name, demo_date')
    .filter('config->>kind', 'eq', 'ai_pulse')
    .gte('demo_date', sinceISO);

  if (cyclesError) {
    return NextResponse.json(
      { error: 'Failed to list cycles', detail: cyclesError.message },
      { status: 500 }
    );
  }
  const cycles = (cyclesRaw || []) as Array<{ id: string }>;
  const cycleIds = cycles.map((c) => c.id);

  if (cycleIds.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: {
        cycles_scanned: 0,
        flags_created: 0,
        flags_skipped_existing: 0,
        elapsed_ms: Date.now() - startedAt,
      },
    });
  }

  // -- 3. Existing open flags (idempotency set) ---------------------------
  const { data: openFlagsRaw, error: openFlagsError } = await (supabase as any)
    .from('ai_pulse_anomaly_flags')
    .select('startup_event_id, flag_type, target_user_id, review_outcome')
    .in('startup_event_id', cycleIds)
    .or('review_outcome.is.null,review_outcome.eq.pending');

  if (openFlagsError) {
    return NextResponse.json(
      { error: 'Failed to read existing flags', detail: openFlagsError.message },
      { status: 500 }
    );
  }
  const openKeys = new Set(
    ((openFlagsRaw || []) as any[]).map(
      (f) => `${f.startup_event_id}::${f.flag_type}::${f.target_user_id ?? ''}`
    )
  );
  const flagKey = (f: FlagInsert) =>
    `${f.startup_event_id}::${f.flag_type}::${f.target_user_id ?? ''}`;

  const candidates: FlagInsert[] = [];

  // -- 4. Detector 1: quiz pass without attending -------------------------
  const { data: attRaw, error: attError } = await (supabase as any)
    .from('ai_pulse_live_attendance')
    .select('event_id, profile_id, engagement_signals, day_type')
    .in('event_id', cycleIds)
    .eq('day_type', 'live_session');

  if (attError) {
    return NextResponse.json(
      { error: 'Failed to read attendance', detail: attError.message },
      { status: 500 }
    );
  }

  for (const row of (attRaw || []) as any[]) {
    const signals = (row.engagement_signals ?? {}) as {
      quiz_score?: number;
      quiz_async_makeup?: boolean;
      joined_within_5min?: boolean;
      stayed_until?: string;
    };
    const quizScore =
      typeof signals.quiz_score === 'number' ? signals.quiz_score : null;
    if (quizScore === null) continue;
    if (signals.quiz_async_makeup) continue; // legit async make-up path
    const passedWithoutAttending =
      quizScore >= quizPassThreshold &&
      signals.joined_within_5min === false &&
      !signals.stayed_until;
    if (!passedWithoutAttending) continue;

    candidates.push({
      startup_event_id: row.event_id,
      flag_type: 'intra_dept_scoring_outlier',
      target_user_id: row.profile_id ?? null,
      signal_value: quizScore,
      signal_threshold: quizPassThreshold,
      details_json: {
        detector: 'quiz_pass_without_attendance',
        joined_within_5min: signals.joined_within_5min ?? null,
        stayed_until: signals.stayed_until ?? null,
        policy_key: 'quiz_pass_threshold_live',
      },
    });
  }

  // -- 5. Detector 2: reach outlier ----------------------------------------
  const { data: subsRaw, error: subsError } = await (supabase as any)
    .from('event_submissions')
    .select('event_id, registration_id, submitted_by, active_users_count')
    .in('event_id', cycleIds)
    .gt('active_users_count', reachOutlierThreshold);

  if (subsError) {
    return NextResponse.json(
      { error: 'Failed to read submissions', detail: subsError.message },
      { status: 500 }
    );
  }

  for (const sub of (subsRaw || []) as any[]) {
    candidates.push({
      startup_event_id: sub.event_id,
      flag_type: 'ig_reach_inconsistent',
      target_user_id: sub.submitted_by ?? null,
      signal_value:
        typeof sub.active_users_count === 'number'
          ? sub.active_users_count
          : null,
      signal_threshold: reachOutlierThreshold,
      details_json: {
        detector: 'reach_outlier',
        registration_id: sub.registration_id ?? null,
        ig_reach_threshold: igReachThreshold,
        reach_outlier_multiplier: reachOutlierMultiplier,
        policy_keys: ['ig_reach_threshold', 'reach_outlier_multiplier'],
      },
    });
  }

  // -- 6. Idempotent insert -------------------------------------------------
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    const key = flagKey(candidate);
    if (openKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const { error: insertError } = await (supabase as any)
      .from('ai_pulse_anomaly_flags')
      .insert({ ...candidate, review_outcome: 'pending' });

    if (insertError) {
      errors.push(insertError.message);
    } else {
      created += 1;
      openKeys.add(key); // dedupe within this run too
    }
  }

  const summary = {
    cycles_scanned: cycleIds.length,
    quiz_threshold: quizPassThreshold,
    reach_outlier_threshold: reachOutlierThreshold,
    candidates: candidates.length,
    flags_created: created,
    flags_skipped_existing: skipped,
    insert_errors: errors.length,
    elapsed_ms: Date.now() - startedAt,
  };

  console.log('[cron/ai-pulse-anomaly-scan]', summary);

  return NextResponse.json({ ok: true, summary, errors });
}
