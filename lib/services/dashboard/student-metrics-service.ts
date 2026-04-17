/**
 * Dashboard v2 — Student/Learner Metrics Service (server-side)
 *
 * Calls `fn_student_metrics()` RPC which reads auth.uid() and returns
 * student-scoped hero tile data (attendance %, fee balance, timetable, deadlines).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import { createClient } from '@/lib/supabase/server';

export type StudentBand = 'red' | 'amber' | 'green';

export type TimetableClass = {
  course: string;
  course_name: string;
  time: string;
  faculty: string;
  room: string;
  start_time: string;
  is_break: boolean;
};

export type Deadline = {
  title: string;
  due: string;
  type: string;
};

export type StudentMetrics = {
  attendance: {
    pct_semester: number;
    present: number;
    total: number;
    band: StudentBand;
    data_source?: string;
  };
  fees: {
    balance_due: number;
    next_due_date: string | null;
    currency: string;
    data_source?: string;
  };
  timetable_today: {
    classes: TimetableClass[];
    total: number;
    data_source?: string;
  };
  deadlines: {
    upcoming: Deadline[];
    count: number;
    data_source?: string;
  };
  scope: {
    user_id: string | null;
    learner_id?: string | null;
    institution_id: string | null;
    computed_at: string;
  };
};

const EMPTY_STUDENT_METRICS: StudentMetrics = {
  attendance: { pct_semester: 0, present: 0, total: 0, band: 'red', data_source: 'empty' },
  fees: { balance_due: 0, next_due_date: null, currency: 'INR', data_source: 'empty' },
  timetable_today: { classes: [], total: 0, data_source: 'empty' },
  deadlines: { upcoming: [], count: 0, data_source: 'empty' },
  scope: { user_id: null, institution_id: null, computed_at: new Date().toISOString() }
};

/**
 * Fetches all 4 student hero tile metrics in a single RPC call.
 * Returns EMPTY_STUDENT_METRICS on error (resilient to DB hiccups).
 */
export async function getStudentMetrics(): Promise<StudentMetrics> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_student_metrics');

    if (error) {
      console.error('[dashboard/student-metrics] RPC error:', error);
      return EMPTY_STUDENT_METRICS;
    }

    return (data as StudentMetrics) ?? EMPTY_STUDENT_METRICS;
  } catch (err) {
    console.error('[dashboard/student-metrics] unexpected error:', err);
    return EMPTY_STUDENT_METRICS;
  }
}

/**
 * Formats a number as Indian Rupees (e.g. 12500 → "12,500").
 */
export function formatInrAmount(amount: number): string {
  if (amount === 0) return '0';
  return amount.toLocaleString('en-IN');
}
