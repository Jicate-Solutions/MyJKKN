// ============================================================================
// Ops cycle-time loop family — the shared measurement service
// ============================================================================
// Loop-program master spec 2026-08-13, Wave 2 "Ops cycle-time family": ONE
// shared loop service over three operational queues (service_requests,
// hr_attendance_exceptions, resource_approvals) — the Q2 twin rule made
// structural. There is exactly one measurer for all three queues:
// fn_loops_measure_ops_cycletime (migration 20261002010000), which normalises
// each queue to (opened_at, closed_at) via a per-queue extraction branch and
// runs ONE shared window/percentile/upsert block. This module is the
// service-side face of that fn: it decides the window, walks the ACTIVE queue
// configs (ops_cycletime_queues — the switchboard), and returns the
// measurements. Adding a queue is a config row + one SQL extraction branch —
// never a copied service.
//
// MEASUREMENT ONLY (Wave-2 scope): no interventions, no notifications. The
// return edge — nudging slow queues and re-measuring the delta — is the
// Wave-3 follow-up, which will also wire a dispatcher routine that calls
// runOpsCycletimeMeasurement on a schedule.
//
// Window semantics: resolution-cohort — an item belongs to the window its
// RESOLUTION landed in (measured by the fn; this module only picks windows).
// The default window is the last FULL 7 UTC days ending at today's midnight,
// so re-running on the same day upserts the same (queue, window) row instead
// of minting a near-duplicate every call.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createServiceRoleClient>;

/** loop_registry key for the family (ONE row for all three queues). */
export const OPS_CYCLETIME_LOOP_KEY = 'ops-cycletime';

/**
 * The queues the shared measurer has extraction branches for. This constant
 * mirrors the closed vocabulary inside fn_loops_measure_ops_cycletime — the
 * fn REFUSES any other key (config-drift guard), and the weekly regress
 * runner asserts that refusal stays armed.
 */
export const OPS_CYCLETIME_QUEUE_KEYS = [
  'service_requests',
  'hr_attendance_exceptions',
  'resource_approvals',
] as const;

export type OpsCycletimeQueueKey = (typeof OPS_CYCLETIME_QUEUE_KEYS)[number];

export interface OpsCycletimeQueueConfig {
  queue_key: string;
  display_name: string;
  source_table: string;
  is_active: boolean;
}

/** Shape of one measurement, as returned by the measure fn (jsonb payload). */
export interface OpsCycletimeMeasurement {
  queue_key: string;
  window_start: string;
  window_end: string;
  resolved_n: number;
  open_backlog_n: number;
  /** NULL when resolved_n = 0 — an empty cohort reports "no number", never 0. */
  median_seconds: number | null;
  p90_seconds: number | null;
}

export interface OpsCycletimeRunResult {
  window_start: string;
  window_end: string;
  measured: OpsCycletimeMeasurement[];
  /** Per-queue failures — one queue failing must not hide the others' numbers. */
  errors: { queue_key: string; error: string }[];
  /**
   * Config rows whose key the measurer has no branch for. Surfaced (not
   * thrown) so a drifted switchboard is VISIBLE in the run result while the
   * healthy queues still get measured; the SQL fn independently refuses such
   * keys if called directly.
   */
  skipped_unknown: string[];
}

/**
 * The last `days` FULL UTC days: window_end = today 00:00:00 UTC,
 * window_start = window_end − days. Day-aligned on purpose — same-day re-runs
 * upsert the same measurement row.
 */
export function opsCycletimeDefaultWindow(
  days = 7,
  now: Date = new Date()
): { windowStart: string; windowEnd: string } {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

/**
 * Measure ONE queue for an explicit window through the shared SQL measurer.
 * Throws on any failure — callers batching queues catch per-queue
 * (see runOpsCycletimeMeasurement).
 */
export async function measureOpsCycletimeQueue(
  admin: Admin,
  queueKey: OpsCycletimeQueueKey,
  windowStart: string,
  windowEnd: string
): Promise<OpsCycletimeMeasurement> {
  const { data, error } = await admin.rpc('fn_loops_measure_ops_cycletime', {
    p_queue_key: queueKey,
    p_window_start: windowStart,
    p_window_end: windowEnd,
  });
  if (error) {
    throw new Error(`fn_loops_measure_ops_cycletime(${queueKey}): ${error.message}`);
  }
  const payload = data as Partial<OpsCycletimeMeasurement> & { success?: boolean };
  if (!payload || payload.success !== true) {
    throw new Error(
      `fn_loops_measure_ops_cycletime(${queueKey}): unexpected payload ${JSON.stringify(data)}`
    );
  }
  return {
    queue_key: payload.queue_key ?? queueKey,
    window_start: payload.window_start ?? windowStart,
    window_end: payload.window_end ?? windowEnd,
    resolved_n: payload.resolved_n ?? 0,
    open_backlog_n: payload.open_backlog_n ?? 0,
    median_seconds: payload.median_seconds ?? null,
    p90_seconds: payload.p90_seconds ?? null,
  };
}

/** The switchboard: active queue configs, source of truth for what runs. */
export async function listActiveOpsCycletimeQueues(
  admin: Admin
): Promise<OpsCycletimeQueueConfig[]> {
  const { data, error } = await admin
    .from('ops_cycletime_queues')
    .select('queue_key, display_name, source_table, is_active')
    .eq('is_active', true)
    .order('queue_key');
  if (error) {
    throw new Error(`ops_cycletime_queues read failed: ${error.message}`);
  }
  return (data ?? []) as OpsCycletimeQueueConfig[];
}

function isKnownQueueKey(key: string): key is OpsCycletimeQueueKey {
  return (OPS_CYCLETIME_QUEUE_KEYS as readonly string[]).includes(key);
}

/**
 * The family's measurement pass: one shared component, every active queue.
 * Reads the switchboard, measures each known queue for the window (default:
 * last full 7 UTC days), and returns numbers + per-queue errors + any
 * unknown-key config drift. Never throws for a single queue's failure.
 */
export async function runOpsCycletimeMeasurement(
  admin: Admin,
  opts?: { windowStart?: string; windowEnd?: string; windowDays?: number }
): Promise<OpsCycletimeRunResult> {
  const fallback = opsCycletimeDefaultWindow(opts?.windowDays ?? 7);
  const windowStart = opts?.windowStart ?? fallback.windowStart;
  const windowEnd = opts?.windowEnd ?? fallback.windowEnd;

  const queues = await listActiveOpsCycletimeQueues(admin);
  const measured: OpsCycletimeMeasurement[] = [];
  const errors: { queue_key: string; error: string }[] = [];
  const skipped_unknown: string[] = [];

  for (const q of queues) {
    if (!isKnownQueueKey(q.queue_key)) {
      skipped_unknown.push(q.queue_key);
      continue;
    }
    try {
      measured.push(
        await measureOpsCycletimeQueue(admin, q.queue_key, windowStart, windowEnd)
      );
    } catch (e) {
      errors.push({
        queue_key: q.queue_key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { window_start: windowStart, window_end: windowEnd, measured, errors, skipped_unknown };
}
