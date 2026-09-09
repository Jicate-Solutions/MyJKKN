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
  search?: string | null;
  /** Only learners at or below this percentage. null = no ceiling. */
  maxPct?: number | null;
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
        // ?? not ||: an empty-string block id would reach Postgres as a real
        // uuid parameter and match zero rows (the `institutionId || ''` trap).
        p_block_id: q.blockId ?? null,
        p_search: q.search ?? null,
        p_max_pct: q.maxPct ?? null,
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
