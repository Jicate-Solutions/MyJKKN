import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Closed attendance months, as `${institution_id}|YYYY-MM` keys.
 *
 * Mirrors hr_trig_block_writes_in_locked_period (status = 'locked'). A bulk
 * writer must drop these rows BEFORE writing: the trigger refuses them one row
 * at a time, so a range spanning a closed month half-lands — the open month's
 * rows are rewritten from the punch verdict, then the first refused row aborts
 * the route before its leave re-stamp runs. That is how 32 approved leave days
 * at Main Office went back to ABSENT (2026-10-05).
 */
export async function fetchLockedMonthKeys(
  client: SupabaseClient,
  institutionIds: string[],
  from: string,
  to: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  if (institutionIds.length === 0) return keys;

  const { data, error } = await client
    .from('hr_attendance_periods')
    .select('institution_id, period_year, period_month')
    .eq('status', 'locked')
    .in('institution_id', institutionIds);
  if (error) throw error;

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  for (const p of data ?? []) {
    const month = `${p.period_year}-${String(p.period_month).padStart(2, '0')}`;
    if (month >= fromMonth && month <= toMonth) keys.add(`${p.institution_id}|${month}`);
  }
  return keys;
}

export const lockedMonthKey = (institutionId: string, workDate: string) =>
  `${institutionId}|${workDate.slice(0, 7)}`;

/**
 * The (institution, from, to) spans to re-stamp leave over: one per open month
 * actually written, clamped to the rows' own dates. fn_restamp_leave_attendance
 * over a range reaching into a locked month would be refused by the same
 * trigger and re-stamp nothing at all.
 */
export function restampSpans(
  rows: Array<{ institution_id: string | null; work_date: string }>,
): Array<{ institutionId: string; from: string; to: string }> {
  const spans = new Map<string, { institutionId: string; from: string; to: string }>();
  for (const r of rows) {
    if (!r.institution_id) continue;
    const d = String(r.work_date).slice(0, 10);
    const key = lockedMonthKey(r.institution_id, d);
    const s = spans.get(key);
    if (!s) spans.set(key, { institutionId: r.institution_id, from: d, to: d });
    else {
      if (d < s.from) s.from = d;
      if (d > s.to) s.to = d;
    }
  }
  return [...spans.values()];
}
