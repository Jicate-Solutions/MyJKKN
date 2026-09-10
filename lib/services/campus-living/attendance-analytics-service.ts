/**
 * Hostel attendance analytics — typed wrappers over the three
 * fn_cl_attendance_* RPCs (migration 20260909190000).
 *
 * Structure copied from bed-economics-service.ts: static methods, browser
 * client singleton, one method per RPC, every error surfaced.
 *
 * WHY RPCs AND NOT POSTGREST. The pre-existing attendance aggregates read raw
 * rows and grouped them in JS — CampusLivingAnalytics.getAttendanceTrend has no
 * .limit() at all, and HostelAttendanceService.getAttendanceDashboard caps at
 * 5000/5000/20000 rows and silently truncates past that. Aggregation belongs in
 * Postgres; the daily rollup measures ~5 ms on a clean index scan.
 *
 * The RPCs are SECURITY INVOKER, so the caller's own RLS scope applies to
 * attendance and allocations alike and a warden's coverage denominator matches
 * her attendance numerator automatically.
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type {
  AttendanceDashboard,
  AttendanceLearnerRow,
  AttendanceLearnerDetail,
} from '@/types/campus-living/attendance-analytics';

export interface AttendanceLearnerQuery {
  from: string;
  to: string;
  blockId?: string | null;
  institutionId?: string | null;
  search?: string | null;
  /** Percentage band. A learner with no counted days (null pct) is excluded
   *  from a band rather than passing every comparison as NULL does in SQL. */
  minPct?: number | null;
  maxPct?: number | null;
  /** Only learners whose longest absence run reaches this many marked days. */
  minAbsentRun?: number | null;
  /** Only learners still absent as of their last marked day. */
  onlyOngoing?: boolean;
  /** Learners having at least one day of this status in range. */
  status?: string | null;
  sortBy?: string | null;
  sortOrder?: 'asc' | 'desc' | null;
  limit?: number;
  offset?: number;
}

export class AttendanceAnalyticsService {
  /** Every dashboard panel in one round trip. */
  static async getDashboard(
    from: string,
    to: string,
    blockId?: string | null,
  ): Promise<AttendanceDashboard> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_cl_attendance_dashboard' as never,
      { p_from: from, p_to: to, p_block_id: blockId ?? null } as never,
    );
    // Errors are thrown, never coerced to an empty shape: a 57014 statement
    // timeout must not reach the UI looking like "no attendance this month".
    if (error) {
      throw new Error(`Attendance dashboard failed: ${getErrorMessage(error)}`);
    }
    return data as unknown as AttendanceDashboard;
  }

  /** Paginated per-learner rollup, worst attendance first. */
  static async getLearners(q: AttendanceLearnerQuery): Promise<AttendanceLearnerRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_cl_attendance_learners' as never,
      {
        p_from: q.from,
        p_to: q.to,
        // ?? not ||: an empty-string id would reach Postgres as a real uuid
        // parameter and match zero rows (the `institutionId || ''` trap).
        p_block_id: q.blockId ?? null,
        p_search: q.search ?? null,
        p_min_pct: q.minPct ?? null,
        p_max_pct: q.maxPct ?? null,
        p_institution_id: q.institutionId ?? null,
        p_min_absent_run: q.minAbsentRun ?? null,
        p_only_ongoing: q.onlyOngoing ?? false,
        p_status: q.status ?? null,
        p_sort_by: q.sortBy ?? 'attendance_pct',
        p_sort_order: q.sortOrder ?? 'asc',
        p_limit: q.limit ?? 50,
        p_offset: q.offset ?? 0,
      } as never,
    );
    if (error) {
      throw new Error(`Attendance learner list failed: ${getErrorMessage(error)}`);
    }
    return (data ?? []) as unknown as AttendanceLearnerRow[];
  }

  /** One learner: identity, summary with streaks, day series, full mark log. */
  static async getLearnerDetail(
    learnerId: string,
    from: string,
    to: string,
  ): Promise<AttendanceLearnerDetail> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_cl_attendance_learner_detail' as never,
      { p_learner_id: learnerId, p_from: from, p_to: to } as never,
    );
    if (error) {
      throw new Error(`Attendance learner detail failed: ${getErrorMessage(error)}`);
    }
    return data as unknown as AttendanceLearnerDetail;
  }
}
