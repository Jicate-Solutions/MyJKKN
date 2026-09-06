/**
 * Client for POST /api/hr/attendance/recompute.
 * Created: 2026-08-09.
 * Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
 *
 * A thin fetch wrapper rather than a method on AttendanceRecordService: that
 * class takes a SupabaseClient as its first argument by HR-module convention,
 * and this call deliberately does NOT go through PostgREST. Re-judging a day
 * means running the TypeScript evaluator, which only exists server-side.
 */

export interface RecomputeParams {
  /** Limit to one institution. Omit to sweep every institution you can see. */
  institutionId?: string | null;
  /** `yyyy-MM-dd`, inclusive. */
  from: string;
  to: string;
  /** Report what would change without writing. */
  dryRun?: boolean;
}

export interface RecomputeSummary {
  success: boolean;
  dry_run: boolean;
  examined: number;
  changed: number;
  status_changed: number;
  /** Days whose timing no longer resolves; left untouched. */
  unresolvable: number;
  /** `"ABSENT → PRESENT": 12` */
  transitions: Record<string, number>;
  changes: Array<{ employee_id: string; work_date: string; from: string; to: string }>;
  written?: number;
  message: string;
}

export async function recomputeAttendance(params: RecomputeParams): Promise<RecomputeSummary> {
  const res = await fetch('/api/hr/attendance/recompute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionId: params.institutionId ?? null,
      from: params.from,
      to: params.to,
      dryRun: params.dryRun === true,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || body?.error || `Recompute failed (${res.status})`);
  }
  return body as RecomputeSummary;
}

/** `yyyy-MM-dd` for today, in the viewer's zone — matches the form's date input. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
