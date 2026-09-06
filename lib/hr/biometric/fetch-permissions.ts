/**
 * Approved short-time-off windows, keyed for evaluateDay().
 * Created: 2026-08-21.
 *
 * evaluateDay() reinstates a half whose missing minutes an approved permission
 * fully covers. Every caller of the evaluator therefore has to supply the same
 * set of windows, or the same punch pair yields different verdicts depending on
 * which entry point judged it — the drift the "ONE EVALUATOR, THREE CALLERS"
 * note in the recompute route exists to prevent.
 *
 * NO `!inner` ON THE TYPE. `hr_leave_types!inner(request_category)` would turn
 * this into an INNER JOIN, and one type the caller cannot read under RLS would
 * silently drop that person's permission — the day would then judge as if the
 * permission had never been approved. The short-time-off type ids are resolved
 * first and used as a plain `.in()` filter instead.
 *
 * ONLY 'approved'. A pending or rejected request must never reinstate a half;
 * that is the whole point of approving one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermissionWindow } from './evaluate-day';

/** `${employeeId}|${yyyy-MM-dd}` -> the windows approved for that person that day. */
export type PermissionsByStaffDay = Map<string, PermissionWindow[]>;

export function permissionKey(staffId: string, workDate: string): string {
  return `${staffId}|${workDate}`;
}

export async function fetchApprovedPermissions(
  supabase: SupabaseClient,
  staffIds: string[],
  from: string,
  to: string,
): Promise<PermissionsByStaffDay> {
  const out: PermissionsByStaffDay = new Map();
  if (staffIds.length === 0 || !from || !to) return out;

  const { data: types, error: typeErr } = await supabase
    .from('hr_leave_types')
    .select('id')
    .eq('request_category', 'short_time_off');
  if (typeErr) throw typeErr;

  const typeIds = ((types ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (typeIds.length === 0) return out;

  const { data, error } = await supabase
    .from('hr_leave_applications')
    .select('id, employee_id, start_date, start_time, end_time')
    .in('leave_type_id', typeIds)
    .in('employee_id', staffIds)
    .eq('status', 'approved')
    .eq('duration_type', 'hourly')
    .gte('start_date', from)
    .lte('start_date', to)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null)
    .limit(20000);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    id: string; employee_id: string; start_date: string;
    start_time: string; end_time: string;
  }>) {
    const key = permissionKey(row.employee_id, row.start_date);
    const list = out.get(key);
    const win: PermissionWindow = { id: row.id, from: row.start_time, to: row.end_time };
    if (list) list.push(win);
    else out.set(key, [win]);
  }

  return out;
}
