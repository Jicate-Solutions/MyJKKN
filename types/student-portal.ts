/**
 * Student Portal Type Definitions
 * Created: 2026-01-14
 * Description: Type definitions for student-facing portal features
 */

import { DayOfWeek, Period } from './academics';

export interface StudentTimetableData {
  /**
   * The PRIMARY timetable — the one covering today, most recently created.
   * Kept for the page header and for callers that predate the merge. When a
   * learner sits under more than one active timetable, `slots` holds all of
   * them and each slot names its own source; do not assume every slot belongs
   * to this id.
   */
  timetable_id: string;
  timetable_name: string;
  timetable_format: 'regular' | 'batch';
  /** Updated: 2026-09-11 - Every active timetable feeding `slots`. */
  source_timetables?: Array<{ id: string; name: string }>;
  periods: Period[];
  slots: EnrichedTimetableSlot[];
  selected_days?: DayOfWeek[];
  start_date?: string; // Timetable start date
  end_date?: string; // Timetable end date
  student_info: {
    name: string;
    roll_number: string;
    section_name: string;
    semester_name: string;
    degree_name?: string;
    department_name?: string;
    program_name?: string;
  };
}

export interface EnrichedTimetableSlot {
  /**
   * Updated: 2026-09-11 - Which timetable this slot came from.
   *
   * A learner can sit under more than one active timetable at once — the
   * common shape is a semester-level THEORY grid plus a section-level CLINICAL
   * one, both covering the same dates. Their periods are merged into a single
   * view, so each slot has to carry its own origin: the attendance link needs
   * the right timetable id, and the learner needs to be told which timetable a
   * period belongs to when two of them claim the same hour.
   */
  timetable_id?: string;
  timetable_name?: string;
  slot_id: string;
  day: DayOfWeek;
  period_id: string;
  period: {
    period_name: string;
    start_time: string; // HH:MM:SS
    end_time: string;
    is_break: boolean;
  };
  course: {
    course_id: string;
    course_name: string;
    course_code: string;
  };
  staff_members: Array<{
    staff_id: string;
    staff_name: string;
  }>;
  room?: string;
}

export interface CurrentPeriodInfo {
  period_id: string;
  period_name: string;
  slot: EnrichedTimetableSlot | null;
  time_range: string;
  ends_at: string; // ISO timestamp
}

export type EmptyStateType = 'no-timetable' | 'no-section' | 'weekend' | 'no-classes' | 'error';
