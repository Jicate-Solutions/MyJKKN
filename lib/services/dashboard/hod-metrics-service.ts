import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export type HodBand = 'red' | 'amber' | 'green';

export interface DhsComponents {
  dept_attendance: number | null;
  faculty_marking: number | null;
  grievance_resolution: number | null;
  learner_pass_rate: number | null;
}

export interface DepartmentHealthScore {
  score: number;
  band: HodBand;
  components: DhsComponents;
  present_components?: string[];
  missing_components?: string[];
  effective_weights?: Record<string, number>;
  window?: 'trailing_30_days';
  data_source?: string;
}

export interface HodMetrics {
  dept_attendance_pct: number;
  attendance_baseline: number;
  marking_compliance_pct: number;
  open_grievances: number;
  pending_leave_approvals: number;
  department_health_score?: DepartmentHealthScore;
}

const EMPTY_METRICS: HodMetrics = {
  dept_attendance_pct: 0,
  attendance_baseline: 75,
  marking_compliance_pct: 0,
  open_grievances: 0,
  pending_leave_approvals: 0,
  department_health_score: {
    score: 0,
    band: 'red',
    components: { dept_attendance: null, faculty_marking: null, grievance_resolution: null, learner_pass_rate: null },
    data_source: 'empty'
  }
};

export class HodMetricsService {
  /**
   * Fetch HOD dashboard hero metrics via RPC.
   * Returns graceful zeros on any error.
   */
  static async getMetrics(): Promise<HodMetrics> {
    try {
      const supabase = createClientSupabaseClient();
      // fn_hod_metrics is a custom RPC not in generated Database type — cast.
      const { data, error } = await (supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>)('fn_hod_metrics');

      if (error) {
        logger.error('dashboard/hod', 'fn_hod_metrics RPC failed', error);
        return EMPTY_METRICS;
      }

      return (data as unknown as HodMetrics) ?? EMPTY_METRICS;
    } catch (err) {
      logger.error('dashboard/hod', 'HodMetricsService.getMetrics threw', err);
      return EMPTY_METRICS;
    }
  }
}
