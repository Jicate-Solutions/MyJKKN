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

/**
 * Doctrines v1 — Teaching Excellence Score (TES)
 * Components (all optional, NULL renormalizes out):
 *   - student_attendance   (25%) — % Present in faculty's marked classes (30d)
 *   - marking_compliance   (25%) — % of weekdays marked in trailing 30d
 *   - feedback_nps         (25%) — NULL until NPS schema exists
 *   - research_mentorship  (25%) — NULL until research/mentorship schema exists
 */
export type TesComponents = {
  student_attendance: number | null;
  marking_compliance: number | null;
  feedback_nps: number | null;
  research_mentorship: number | null;
};

export type TeachingExcellenceScore = {
  score: number;
  band: FacultyBand;
  components: TesComponents;
  present_components?: string[];
  missing_components?: string[];
  effective_weights?: Record<string, number>;
  window?: 'trailing_30_days';
  data_source?: string;
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
  teaching_excellence_score?: TeachingExcellenceScore;
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
  teaching_excellence_score: {
    score: 0,
    band: 'red',
    components: { student_attendance: null, marking_compliance: null, feedback_nps: null, research_mentorship: null },
    data_source: 'empty'
  },
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
