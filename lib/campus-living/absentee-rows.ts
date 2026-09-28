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
 * One row per resident absent on their BLOCK's latest marked day — the most
 * recent day that block has any attendance record for, whatever the status, so a
 * block that marks late keeps its still-absent residents until it marks, and a
 * block with no absences today does not show yesterday's. Pass every record in
 * the window, not only absences. The run counts back one calendar day at a time
 * while the resident was marked absent on that day; `windowStart` (the first day
 * fetched) caps it, and a run that reaches it is flagged `atLeast`. Rows with no
 * learner id are ignored. Sorted by longest run, then name.
 */
export function buildAbsenteeRows(
  records: Pick<HostelAttendance, 'learner_id' | 'date' | 'evening_status' | 'learner' | 'block' | 'block_id'>[],
  windowStart: string,
): AbsenteeRow[] {
  const blockKey = (r: (typeof records)[number]) => r.block_id ?? r.block?.id ?? '';
  const latestByBlock = new Map<string, string>();
  for (const r of records) {
    if (!r.date) continue;
    const k = blockKey(r);
    const cur = latestByBlock.get(k);
    if (!cur || r.date > cur) latestByBlock.set(k, r.date);
  }
  const absent = records.filter((r) => r.evening_status === 'absent' && r.learner_id && r.date);
  if (absent.length === 0) return [];

  const byLearner = new Map<string, typeof absent>();
  for (const r of absent) {
    const list = byLearner.get(r.learner_id) ?? [];
    list.push(r);
    byLearner.set(r.learner_id, list);
  }

  const rows: AbsenteeRow[] = [];
  for (const [learnerId, list] of byLearner) {
    const days = new Set(list.map((r) => r.date));
    // The block of the resident's newest absence decides which day is "today".
    const newest = list.reduce((a, r) => (r.date > a.date ? r : a), list[0]);
    const latest = latestByBlock.get(blockKey(newest)) ?? newest.date;
    if (!days.has(latest)) continue; // not absent on their block's latest marked day
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

/** YYYY-MM-DD of `d` in the viewer's own time zone (toISOString is UTC, which in
 *  IST before 05:30 is still yesterday). */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** First day of an `ABSENTEE_WINDOW_DAYS`-day window ending on `today` (local). */
export function absenteeWindowStart(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - (ABSENTEE_WINDOW_DAYS - 1));
  return localIsoDate(d);
}

/**
 * Reads every page of a counted query instead of trusting one capped page: the
 * API returns at most 1000 rows per request, and five days across every college
 * can pass that. Stops once `count` rows are in, a page comes back short, or
 * `maxPages` is hit — then `truncated` says the list is incomplete.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; count: number }>,
  maxPages = 20,
): Promise<{ data: T[]; count: number; truncated: boolean }> {
  const data: T[] = [];
  let count = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchPage(page);
    count = res.count;
    data.push(...res.data);
    if (data.length >= count || res.data.length === 0) return { data, count, truncated: false };
  }
  return { data, count, truncated: data.length < count };
}
