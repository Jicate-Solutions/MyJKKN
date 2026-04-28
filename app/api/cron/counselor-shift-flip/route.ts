// =====================================================================
// Counselor Shift-Flip Cron — every 15 min (spec #537, decision #18)
// =====================================================================
// Drives the admission counselor rules-engine Phase 4 operations:
//
//  Task A — CASCADE: call fn_cascade_off_duty_counselors() which sweeps
//   all active counselors, detects off-duty flips > COUNSELOR_CASCADE_THRESHOLD_MIN
//   (default 60 min per decision #5), and reassigns their open leads via
//   fn_reassign_off_duty_leads(). Inserts rows into admission_lead_cascade_history
//   (decision #O3 audit log).
//
//  Task B — FLUSH: call fn_flush_queued_leads() which re-routes any leads
//   sitting with counselor_id=NULL (queued per decision #15) to on-duty
//   counselors who are now available.
//
//  Task C — MIDNIGHT CLEAR: at 00:00 IST (any 15-min window that includes
//   midnight), clear emergency_off_today flags per decision #17.
//
// Both sub-tasks are independent — failure of one does NOT skip the other.
// Safe to fire arbitrarily often: idempotent, worst-case 14-min lag on cascade.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> header (Vercel auto-sends)
//       OR ?secret=<value> query param (manual/test invocations).
//       Mirrors pattern in cron/dashboard-work-items and cron/sentry-lane-2.
//
// Required env: CRON_SECRET (already in Vercel)
// Optional env: COUNSELOR_CASCADE_THRESHOLD_MIN (default 60, passed to SQL fn)
//
// Soft dependency: fn_cascade_off_duty_counselors + fn_flush_queued_leads
//   must exist on prod (shipped in Phase 3a, PR #537 companion).
//   Both calls are wrapped in try/catch — if Phase 3a is not yet live,
//   the route returns ok:true with the error surfaced in the sub-task result.
//
// Created: 2026-04-28 — Phase 4 of specs/admission-counselor-rules-engine-spec.md

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// IST offset from UTC (UTC+5:30 = 330 minutes)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns true if the current UTC time is within the midnight IST window (00:00–00:15 IST). */
function isMidnightISTWindow(): boolean {
  const nowISTMs = Date.now() + IST_OFFSET_MS;
  const minuteOfDayIST = Math.floor((nowISTMs % (24 * 60 * 60 * 1000)) / 60000);
  return minuteOfDayIST < 15; // 00:00–00:14 IST
}

export async function GET(request: NextRequest) {
  const started = Date.now();

  // ----------------------------------------------------------------
  // Auth: Bearer header (Vercel cron auto-sends) OR ?secret= query param
  // (for manual curl / local testing). Pattern mirrors dashboard-work-items.
  // ----------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // ----------------------------------------------------------------
  // Task A: Cascade off-duty counselors
  // fn_cascade_off_duty_counselors() — Phase 3a function (PR #537 companion).
  // Sweeps all active counselors, invokes fn_reassign_off_duty_leads(id)
  // for any who have been off-duty beyond COUNSELOR_CASCADE_THRESHOLD_MIN (60 min).
  // Returns an array of { counselor_id, leads_reassigned, leads_queued }.
  // ----------------------------------------------------------------
  const cascadeResult: {
    rows: unknown[] | null;
    reassigned: number;
    queued: number;
    error: string | null;
  } = { rows: null, reassigned: 0, queued: 0, error: null };

  try {
    const { data, error } = await supabase.rpc('fn_cascade_off_duty_counselors');
    if (error) throw error;
    const rows = (data ?? []) as Array<{ leads_reassigned?: number; leads_queued?: number }>;
    cascadeResult.rows = rows;
    cascadeResult.reassigned = rows.reduce((sum, r) => sum + (r.leads_reassigned ?? 0), 0);
    cascadeResult.queued = rows.reduce((sum, r) => sum + (r.leads_queued ?? 0), 0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/counselor-shift-flip] Task A (cascade) failed:', msg);
    cascadeResult.error = msg;
  }

  // ----------------------------------------------------------------
  // Task B: Flush queued leads (counselor_id=NULL) to on-duty counselors.
  // fn_flush_queued_leads() — Phase 3a function.
  // Returns an array of { lead_id, assigned_counselor_id } for each flushed lead.
  // Independent of Task A — runs regardless of Task A outcome.
  // ----------------------------------------------------------------
  const flushResult: {
    rows: unknown[] | null;
    assigned: number;
    still_queued: number;
    error: string | null;
  } = { rows: null, assigned: 0, still_queued: 0, error: null };

  try {
    const { data, error } = await supabase.rpc('fn_flush_queued_leads');
    if (error) throw error;
    const rows = (data ?? []) as Array<{ assigned_counselor_id?: string | null }>;
    flushResult.rows = rows;
    flushResult.assigned = rows.filter(r => r.assigned_counselor_id != null).length;
    flushResult.still_queued = rows.filter(r => r.assigned_counselor_id == null).length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/counselor-shift-flip] Task B (flush) failed:', msg);
    flushResult.error = msg;
  }

  // ----------------------------------------------------------------
  // Task C: Midnight IST clear — reset emergency_off_today flags.
  // Decision #17: emergency-off covers today only, auto-clears at 00:00 IST.
  // Runs only in the 00:00–00:14 IST window to avoid repeated clears.
  // Independent of Tasks A + B.
  // ----------------------------------------------------------------
  const midnightClearResult: {
    ran: boolean;
    cleared: number;
    error: string | null;
  } = { ran: false, cleared: 0, error: null };

  if (isMidnightISTWindow()) {
    midnightClearResult.ran = true;
    try {
      const { data, error } = await supabase
        .from('admission_counselors')
        .update({ emergency_off_today: false, emergency_off_set_at: null })
        .eq('emergency_off_today', true)
        .select('id');
      if (error) throw error;
      midnightClearResult.cleared = (data ?? []).length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron/counselor-shift-flip] Task C (midnight clear) failed:', msg);
      midnightClearResult.error = msg;
    }
  }

  // ----------------------------------------------------------------
  // Success marker (per memory: feedback_routine_must_always_post_marker.md)
  // Every run — even zero-row no-ops — logs a structured payload so any
  // freshness-gate or monitoring tool can see the cron is alive.
  // This codebase uses console.warn for structured cron telemetry (no
  // shared cron_health_log table exists — confirmed by reading peer crons).
  // ----------------------------------------------------------------
  const durationMs = Date.now() - started;
  const anyError = !!(cascadeResult.error || flushResult.error || midnightClearResult.error);

  console.warn('[cron/counselor-shift-flip] run-complete', JSON.stringify({
    ok: true,
    duration_ms: durationMs,
    cascade: {
      counselors_processed: Array.isArray(cascadeResult.rows) ? cascadeResult.rows.length : 0,
      leads_reassigned: cascadeResult.reassigned,
      leads_re_queued: cascadeResult.queued,
      error: cascadeResult.error,
    },
    flush: {
      leads_assigned: flushResult.assigned,
      leads_still_queued: flushResult.still_queued,
      error: flushResult.error,
    },
    midnight_clear: midnightClearResult,
    has_errors: anyError,
  }));

  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    cascade: {
      counselors_processed: Array.isArray(cascadeResult.rows) ? cascadeResult.rows.length : 0,
      leads_reassigned: cascadeResult.reassigned,
      leads_re_queued: cascadeResult.queued,
      error: cascadeResult.error,
    },
    flush: {
      leads_assigned: flushResult.assigned,
      leads_still_queued: flushResult.still_queued,
      error: flushResult.error,
    },
    midnight_clear: midnightClearResult,
  });
}
