/**
 * Dashboard v2 — Faculty Metrics Service (server-side)
 *
 * Calls `fn_faculty_metrics()` RPC which reads auth.uid() and returns
 * faculty-scoped hero tile data (unmarked classes, learner flags,
 * upcoming timetable, week attendance %).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import { createClient } from '@/lib/supabase/server';

export type FacultyBand = 'red' | 'amber' | 'green';

export type UpcomingClass = {
  course: string;
  time: string;
  section: string;
};

export type FacultyMetrics = {
  unmarked_classes: {
    count: number;
    total_today: number;
    data_source?: string;
  };
  learner_flags: {
    count: number;
    data_source?: string;
  };
  upcoming_timetable: {
    classes: UpcomingClass[];
    next_2h_count: number;
    data_source?: string;
  };
  week_attendance: {
    pct: number;
    days_marked: number;
    days_total: number;
    data_source?: string;
  };
  scope: {
    user_id: string | null;
    institution_id: string | null;
    computed_at: string;
  };
};

const EMPTY_FACULTY_METRICS: FacultyMetrics = {
  unmarked_classes: { count: 0, total_today: 0 },
  learner_flags: { count: 0, data_source: 'not_available' },
  upcoming_timetable: { classes: [], next_2h_count: 0 },
  week_attendance: { pct: 0, days_marked: 0, days_total: 0 },
  scope: { user_id: null, institution_id: null, computed_at: new Date().toISOString() }
};

/**
 * Fetches all 4 faculty hero tile metrics in a single RPC call.
 * Returns EMPTY_FACULTY_METRICS on error (resilient to DB hiccups).
 */
export async function getFacultyMetrics(): Promise<FacultyMetrics> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_faculty_metrics');

    if (error) {
      console.error('[dashboard/faculty-metrics] RPC error:', error);
      return EMPTY_FACULTY_METRICS;
    }

    return (data as FacultyMetrics) ?? EMPTY_FACULTY_METRICS;
  } catch (err) {
    console.error('[dashboard/faculty-metrics] unexpected error:', err);
    return EMPTY_FACULTY_METRICS;
  }
}
