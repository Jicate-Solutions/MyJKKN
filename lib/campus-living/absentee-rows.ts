// lib/campus-living/absentee-rows.ts
//
// Turns raw hostel_attendance rows (evening_status = 'absent') into one row per
// resident for /campus-living/attendance/absentees.
//
// BUG-006210 (2026-09-25): the page read `student.status`, `name`, `roll`,
// `consecutive_days` … off raw attendance records, which carry none of them —
// the status lives in `evening_status` — so `statusConfig[undefined].variant`
// threw and the whole page fell to the error screen.

import type { HostelAttendance } from '@/types/campus-living';

export type AbsenteeTier = 'critical' | 'warning' | 'normal';

export interface AbsenteeRow {
  learnerId: string;
  name: string;
  email: string | null;
  block: string | null;
  /** Consecutive days absent, counting back from the latest marked day. */
  consecutiveDays: number;
  /** True when the run reaches the start of the fetched window (it may be longer). */
  atLeast: boolean;
  /** First day of the current run of absences (YYYY-MM-DD). */
  absentSince: string;
  tier: AbsenteeTier;
}

/** How many days back the page fetches; a run that fills it shows as "N+". */
export const ABSENTEE_WINDOW_DAYS = 5;

const dayBefore = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export function tierFor(days: number): AbsenteeTier {
  if (days >= 3) return 'critical';
  if (days === 2) return 'warning';
  return 'normal';
}

/**
 * One row per resident absent on the LATEST day present in `records` (the most
 * recent day attendance was marked). The run counts back one calendar day at a
 * time while the resident was marked absent on that day; `windowStart` (the
 * first day fetched) caps it, and a run that reaches it is flagged `atLeast`.
 * Rows with no learner id are ignored. Sorted by longest run, then name.
 */
export function buildAbsenteeRows(
  records: Pick<HostelAttendance, 'learner_id' | 'date' | 'evening_status' | 'learner' | 'block'>[],
  windowStart: string,
): AbsenteeRow[] {
  const absent = records.filter((r) => r.evening_status === 'absent' && r.learner_id && r.date);
  if (absent.length === 0) return [];
  const latest = absent.reduce((max, r) => (r.date > max ? r.date : max), absent[0].date);

  const byLearner = new Map<string, typeof absent>();
  for (const r of absent) {
    const list = byLearner.get(r.learner_id) ?? [];
    list.push(r);
    byLearner.set(r.learner_id, list);
  }

  const rows: AbsenteeRow[] = [];
  for (const [learnerId, list] of byLearner) {
    const days = new Set(list.map((r) => r.date));
    if (!days.has(latest)) continue; // not absent on the latest marked day
    let run = 0;
    let day = latest;
    let first = latest;
    while (days.has(day)) {
      run += 1;
      first = day;
      if (day <= windowStart) break;
      day = dayBefore(day);
    }
    const onLatest = list.find((r) => r.date === latest) ?? list[0];
    rows.push({
      learnerId,
      name: onLatest.learner?.full_name?.trim() || 'Unnamed resident',
      email: onLatest.learner?.email ?? null,
      block: onLatest.block?.name ?? onLatest.block?.code ?? null,
      consecutiveDays: run,
      atLeast: first <= windowStart,
      absentSince: first,
      tier: tierFor(run),
    });
  }
  return rows.sort((a, b) => b.consecutiveDays - a.consecutiveDays || a.name.localeCompare(b.name));
}
