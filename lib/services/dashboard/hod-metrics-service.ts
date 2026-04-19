import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface HodMetrics {
  dept_attendance_pct: number;
  attendance_baseline: number;
  marking_compliance_pct: number;
  open_grievances: number;
  pending_leave_approvals: number;
}

const EMPTY_METRICS: HodMetrics = {
  dept_attendance_pct: 0,
  attendance_baseline: 75,
  marking_compliance_pct: 0,
  open_grievances: 0,
  pending_leave_approvals: 0,
};

export class HodMetricsService {
  /**
   * Fetch HOD dashboard hero metrics via RPC.
   * Returns graceful zeros on any error.
   */
  static async getMetrics(): Promise<HodMetrics> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_hod_metrics');

      if (error) {
        logger.error('dashboard/hod', 'fn_hod_metrics RPC failed', error);
        return EMPTY_METRICS;
      }

      return (data as HodMetrics) ?? EMPTY_METRICS;
    } catch (err) {
      logger.error('dashboard/hod', 'HodMetricsService.getMetrics threw', err);
      return EMPTY_METRICS;
    }
  }
}
