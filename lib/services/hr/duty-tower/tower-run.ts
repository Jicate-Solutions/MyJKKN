// ============================================================================
// HR duty tower — the weekly run (migration 20271007161151)
// ============================================================================
// Once a week (ai_routine_schedules 'hr-duty-tower', Monday 06:47 IST):
//   1. fn_hr_duty_tower_compute(last week) records the on-time readings per
//      duty, per college and for all colleges, and returns one row per duty.
//   2. Each duty's all-college on-time rate is recorded on its loops-tower row
//      (hr-duty-<code>) through the existing recordLoopMeasurement, as a
//      percentage. Until the Director approves a numeric bar on
//      /admin/loops/charters, that records met = NULL ("no numeric bar yet") —
//      neither a hit nor a miss. This file adds no bar of its own.
//   3. fn_hr_trust_suggestions_generate() — returns 0 unless the Director has
//      switched earned-trust suggestions on (ships OFF).
//
// It measures only. Nothing is sent, and no role, permission or approval
// chain is touched.
//
// Idempotent: each duty's run id is 'hr-duty-tower:<week_start>:<code>'; a run
// id already in loop_measurements is skipped, and the compute itself upserts.
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import { recordLoopMeasurement } from '@/lib/services/loops/loop-bar-measurement';
import { towerLoopKey } from '@/types/hr-reliability';

type Admin = ReturnType<typeof createServiceRoleClient>;

export interface TowerDutyOutcome {
  dutyCode: string;
  loopKey: string;
  runId: string;
  items: number;
  /** Percentage 0..100, or null for a week with no items. */
  value: number | null;
  outcome: 'recorded' | 'skipped' | 'failed';
  error?: string;
}

export interface TowerRunResult {
  weekStart: string;
  duties: TowerDutyOutcome[];
  suggestions: number;
}

const IST_OFFSET_MS = 330 * 60_000;

/** The Monday (IST calendar) that starts the week BEFORE the one `now` falls in, as YYYY-MM-DD. */
export function lastWeekStartIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const dow = ist.getUTCDay(); // 0 = Sunday in IST
  const sinceMonday = (dow + 6) % 7;
  const thisMonday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - sinceMonday);
  return new Date(thisMonday - 7 * 86_400_000).toISOString().slice(0, 10);
}

export function towerRunId(weekStart: string, dutyCode: string): string {
  return `hr-duty-tower:${weekStart}:${dutyCode}`;
}

/** on_time_rate 0..1 (numeric may arrive as a string) as a percentage with two decimals. */
export function rateToPercent(rate: number | string | null | undefined): number | null {
  if (rate === null || rate === undefined || rate === '') return null;
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10_000) / 100;
}

/**
 * Run the weekly measurement. Throws when an RPC fails (the cron answers 500);
 * a single measurement that cannot be recorded is reported, not thrown.
 */
export async function runHrDutyTower(admin: Admin, now: Date = new Date()): Promise<TowerRunResult> {
  const weekStart = lastWeekStartIST(now);

  const { data, error } = await admin.rpc('fn_hr_duty_tower_compute', { p_week_start: weekStart });
  if (error) throw new Error(`fn_hr_duty_tower_compute failed: ${error.message}`);

  const rows = (data ?? []) as Array<{ duty_code: string; items: number | null; on_time_rate: number | string | null }>;
  const duties: TowerDutyOutcome[] = [];

  for (const row of rows) {
    const dutyCode = row.duty_code;
    const loopKey = towerLoopKey(dutyCode);
    const runId = towerRunId(weekStart, dutyCode);
    const value = rateToPercent(row.on_time_rate);
    const base = { dutyCode, loopKey, runId, items: Number(row.items ?? 0), value };

    const { data: existing, error: readErr } = await admin
      .from('loop_measurements')
      .select('id')
      .eq('run_id', runId)
      .limit(1);
    if (readErr) throw new Error(`could not read loop_measurements: ${readErr.message}`);
    if ((existing ?? []).length > 0) {
      duties.push({ ...base, outcome: 'skipped' });
      continue;
    }

    const res = await recordLoopMeasurement(admin, { loopKey, value, runId });
    duties.push(res.recorded ? { ...base, outcome: 'recorded' } : { ...base, outcome: 'failed', error: res.error });
  }

  const { data: n, error: genErr } = await admin.rpc('fn_hr_trust_suggestions_generate');
  if (genErr) throw new Error(`fn_hr_trust_suggestions_generate failed: ${genErr.message}`);

  return { weekStart, duties, suggestions: Number(n ?? 0) };
}
