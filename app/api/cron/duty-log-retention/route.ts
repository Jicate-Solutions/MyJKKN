// =====================================================================
// Duty-Log Retention Cron — weekly (spec #559 Phase 8 follow-up)
// =====================================================================
// Purges old rows from admission_counselor_duty_log to keep the table
// bounded. Triggered by Vercel cron registered in vercel.json
// (Sunday 03:00 UTC; sister PR registers the schedule).
//
// Retention policy:
//   - Delete rows where event_at < now() - interval '<retention_days> days'
//   - retention_days is read from the canonical `platform_policies` table
//     via getPolicyInt('compliance.duty_log.retention_days', 90) — Phase 1.5a
//     runtime-config substrate (migration 20260429000002). Director's
//     standing rule (2026-04-29) — every policy decision = config-table row
//     + super_admin UI to write. Tweak from /admin/policies in 5 seconds,
//     no deploy.
//   - Named anti-pattern: feedback_policy_decisions_must_be_config_rows.md
//     (lines 60-63) — hardcoded constants for tunable thresholds = wrong.
//   - Falls back to 90 days when the helper returns the default (policy row
//     missing, RPC error, or value not a number). 90 matches PR #586's
//     original constant.
//   - PRESERVE the most-recent row per counselor regardless of age, so
//     fn_get_off_duty_since() always has a baseline to anchor on. The
//     migration that introduced the table (20260428_phase8_duty_log_implementation.sql)
//     specifies this exact carve-out — see TODO comment lines 14-21.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> header (Vercel auto-sends)
//       OR ?secret=<value> query param (manual / test invocations).
//       Mirrors pattern in cron/counselor-shift-flip and cron/dashboard-work-items.
//
// Required env: CRON_SECRET (already in Vercel)
//
// Success marker: per memory feedback_routine_must_always_post_marker.md,
//   every run logs a structured payload — even no-op zero-delete runs — so
//   any freshness gate or monitor sees the cron is alive.
//
// Created: 2026-04-28 — follow-up to PR #578 (Phase 8 of spec #559)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPolicyInt } from '@/lib/policies/get-policy';

export async function GET(request: NextRequest) {
  const started = Date.now();
  const marker = `duty_log_retention_${new Date().toISOString()}`;

  // ----------------------------------------------------------------
  // Auth: Bearer header (Vercel cron auto-sends) OR ?secret= query param
  // (for manual curl / local testing). Pattern mirrors counselor-shift-flip.
  // ----------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured', marker },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { success: false, error: 'unauthorized', marker },
      { status: 401 }
    );
  }

  const supabase = createServiceRoleClient();

  // ----------------------------------------------------------------
  // Read retention_days from platform_policies (Phase 1.5a substrate —
  // 2026-04-29 Director rule). Falls back to 90 when policy row missing,
  // RPC errors, or value not a number, matching PR #586's original
  // behavior so this PR is a no-op at deploy.
  //
  // The `as any` on the key is intentional — keys.ts consolidation
  // (adding COMPLIANCE_DUTY_LOG_RETENTION_DAYS) is a follow-up PR.
  // ----------------------------------------------------------------
  const FALLBACK_DAYS = 90;
  let retentionDays = FALLBACK_DAYS;
  try {
    retentionDays = await getPolicyInt(
      'compliance.duty_log.retention_days' as any,
      FALLBACK_DAYS,
    );
    if (retentionDays <= 0) {
      console.warn(
        '[cron/duty-log-retention] policy returned non-positive value; falling back to',
        FALLBACK_DAYS,
        retentionDays,
      );
      retentionDays = FALLBACK_DAYS;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      '[cron/duty-log-retention] getPolicyInt threw; falling back to',
      FALLBACK_DAYS,
      msg,
    );
    retentionDays = FALLBACK_DAYS;
  }

  // ----------------------------------------------------------------
  // Retention DELETE with most-recent-per-counselor carve-out.
  // Matches the pattern documented in
  // supabase/migrations/20260428_phase8_duty_log_implementation.sql lines 15-21.
  //
  // We use a raw SQL DELETE via supabase.rpc-friendly pattern — but since
  // there's no helper function for this yet, we use the from() builder
  // with a subquery via .not('id', 'in', ...). The PostgREST way:
  //
  //   DELETE FROM admission_counselor_duty_log
  //   WHERE event_at < now() - interval '<retentionDays> days'
  //     AND id NOT IN (
  //       SELECT DISTINCT ON (counselor_id) id
  //       FROM admission_counselor_duty_log
  //       ORDER BY counselor_id, event_at DESC
  //     );
  //
  // Implementation: two steps
  //   1. Fetch the IDs of most-recent-per-counselor rows.
  //   2. DELETE rows older than retentionDays whose id is NOT in that set.
  // Independent try/catch — never aborts the success marker.
  // ----------------------------------------------------------------
  const result: {
    deleted: number;
    preserved_recent_count: number;
    error: string | null;
  } = { deleted: 0, preserved_recent_count: 0, error: null };

  try {
    // Step 1: get most-recent row id per counselor (DISTINCT ON simulation).
    // We pull all rows ordered by (counselor_id, event_at DESC) and take the
    // first per group in JS. Table is bounded (one row per state-flip), so
    // even at scale this stays under a few thousand rows.
    const { data: allRows, error: fetchErr } = await supabase
      .from('admission_counselor_duty_log')
      .select('id, counselor_id, event_at')
      .order('counselor_id', { ascending: true })
      .order('event_at', { ascending: false });

    if (fetchErr) throw fetchErr;

    const recentIdsByCounselor = new Set<string>();
    const seenCounselors = new Set<string>();
    for (const row of allRows ?? []) {
      if (!seenCounselors.has(row.counselor_id)) {
        seenCounselors.add(row.counselor_id);
        recentIdsByCounselor.add(row.id);
      }
    }
    result.preserved_recent_count = recentIdsByCounselor.size;

    // Step 2: DELETE rows older than retentionDays that are NOT in the
    // preserve set. retentionDays is config-driven (see top of handler).
    const cutoffIso = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const preserveIds = Array.from(recentIdsByCounselor);

    let query = supabase
      .from('admission_counselor_duty_log')
      .delete()
      .lt('event_at', cutoffIso);

    // Only add the NOT IN filter if there are rows to preserve. If the table
    // is empty or has no recent rows, no carve-out is needed.
    if (preserveIds.length > 0) {
      query = query.not('id', 'in', `(${preserveIds.map(id => `"${id}"`).join(',')})`);
    }

    const { data: deletedRows, error: deleteErr } = await query.select('id');
    if (deleteErr) throw deleteErr;

    result.deleted = (deletedRows ?? []).length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/duty-log-retention] DELETE failed:', msg);
    result.error = msg;
  }

  // ----------------------------------------------------------------
  // Success marker (per memory: feedback_routine_must_always_post_marker.md)
  // Every run — even zero-row no-ops — logs a structured payload so any
  // freshness-gate or monitoring tool can see the cron is alive.
  // ----------------------------------------------------------------
  const durationMs = Date.now() - started;

  console.warn('[cron/duty-log-retention] run-complete', JSON.stringify({
    success: !result.error,
    duration_ms: durationMs,
    retention_days: retentionDays,
    deleted: result.deleted,
    preserved_recent_count: result.preserved_recent_count,
    error: result.error,
    marker,
  }));

  if (result.error) {
    return NextResponse.json(
      {
        success: false,
        retention_days: retentionDays,
        deleted: result.deleted,
        duration_ms: durationMs,
        preserved_recent_count: result.preserved_recent_count,
        error: result.error,
        marker,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    retention_days: retentionDays,
    deleted: result.deleted,
    duration_ms: durationMs,
    preserved_recent_count: result.preserved_recent_count,
    marker,
  });
}
