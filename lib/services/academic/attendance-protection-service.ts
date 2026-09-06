/**
 * lib/services/academic/attendance-protection-service.ts
 * Created: 2026-07-31
 *
 * Reads the days an approved permission excuses, and WHY.
 *
 * The Principal's tournament permission letter ends "With Attendance": a
 * learner who represents the college must not lose exam eligibility for the
 * days the college sent them away. The attendance record itself is never
 * rewritten to achieve that — public.student_attendance keeps the day exactly
 * as the Senior Learner marked it — so the only way to answer "why did this
 * absent day still count?" is to ask for the permission behind it. That is what
 * this service is for.
 *
 * Everything comes from fn_attendance_protected_days, the single definition of
 * a protected day, which itself reads approved tournament participation through
 * v_health_tournament_participation. Reading the view rather than re-deriving
 * "approved" means any change to what approval means per college arrives here
 * without a change to this file, and there is never a second opinion about who
 * was on an approved squad.
 *
 * Read-only by design. Nothing here writes attendance; withdrawing the approval
 * withdraws the credit on the next read, with no backfill to undo.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/** One learner-day excused by one approval. A day covered by two approvals
 *  returns twice on purpose — both reasons are true and both are shown. */
export interface ProtectedDay {
  learner_id: string;
  /** ISO date (yyyy-mm-dd) of the excused day. */
  protected_date: string;
  /** 'tournament' — approved squad participation.
   *  'onduty'     — approved full-day on-duty application. */
  source_kind: 'tournament' | 'onduty';
  /** The permission / application row this day is owed to. */
  source_id: string;
  /** Human-readable reason, e.g. "Inter-Collegiate Volleyball Championship — Volleyball". */
  source_label: string;
}

export class AttendanceProtectionService {
  /**
   * Every protected day for the given institutions in a date window.
   *
   * Both bounds are required — the underlying function refuses an unbounded
   * window rather than expand an approval range into an expensive scan.
   * Returns [] rather than throwing: protection is additive, and an attendance
   * screen that cannot reach this should still render the attendance.
   */
  static async getProtectedDays(
    institutionIds: string[],
    from: string,
    to: string,
  ): Promise<ProtectedDay[]> {
    if (institutionIds.length === 0) return [];

    const supabase = createClientSupabaseClient();
    // `as any`: fn_attendance_protected_days ships in this change's migration,
    // so it is not yet in the generated Supabase RPC union. Same pattern the
    // other new-RPC services use until the types are regenerated.
    const { data, error } = await (supabase as any).rpc('fn_attendance_protected_days', {
      p_institution_ids: institutionIds,
      p_from: from,
      p_to: to,
    });

    if (error) {
      logger.error('academic/attendance', 'Failed to read protected days', error);
      return [];
    }
    return (data ?? []) as ProtectedDay[];
  }

  /**
   * The reasons one learner's given day is excused — empty when it is not.
   *
   * This is the answer an examiner is owed when an absent day still counted
   * toward eligibility.
   */
  static async explainDay(
    institutionId: string,
    learnerId: string,
    date: string,
  ): Promise<ProtectedDay[]> {
    const days = await this.getProtectedDays([institutionId], date, date);
    return days.filter((d) => d.learner_id === learnerId);
  }

  /**
   * Protected dates per learner, for marking a roster or a report.
   * Deduplicated: a day excused by two approvals is still one day.
   */
  static async getProtectedDatesByLearner(
    institutionIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, Set<string>>> {
    const byLearner = new Map<string, Set<string>>();
    for (const day of await this.getProtectedDays(institutionIds, from, to)) {
      const dates = byLearner.get(day.learner_id) ?? new Set<string>();
      dates.add(day.protected_date);
      byLearner.set(day.learner_id, dates);
    }
    return byLearner;
  }
}
