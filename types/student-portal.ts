/**
 * Student Portal Type Definitions
 * Created: 2026-01-14
 * Description: Type definitions for student-facing portal features
 */

import { DayOfWeek, Period } from './academics';

export interface StudentTimetableData {
  timetable_id: string;
  timetable_name: string;
  timetable_format: 'regular' | 'batch';
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
