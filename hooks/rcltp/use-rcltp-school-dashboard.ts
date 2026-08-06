/**
 * EKSAQ RCLTP — School-head (principal) dashboard hook (Phase 4e)
 * ----------------------------------------------------------------------------
 * Wraps `RcltpResultsService.getSchoolDashboard` — the read-only aggregate RPC
 * (`fn_rcltp_school_dashboard`) behind the /rcltp/principal dashboard. Every
 * array in the response is empty until EKSAQ scoring produces
 * rcltp_assessment_results rows; the response always carries
 * `provisional: true` and callers MUST show the provisional banner whenever
 * any array is non-empty (see PrincipalDashboard).
 *
 * NOT re-exported from the `hooks/rcltp` barrel (index.ts) — this file was
 * scoped as a standalone addition; import it directly.
 */

import { useQuery } from '@tanstack/react-query';
import { RcltpResultsService } from '@/lib/services/rcltp/results-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { RcltpSchoolDashboard } from '@/types/rcltp';

export const rcltpSchoolDashboardKeys = {
  all: ['rcltp', 'school-dashboard'] as const,
  byInstitution: (institutionId?: string) =>
    ['rcltp', 'school-dashboard', institutionId] as const,
};

export function useRcltpSchoolDashboard(institutionId?: string) {
  return useQuery<RcltpSchoolDashboard>({
    queryKey: rcltpSchoolDashboardKeys.byInstitution(institutionId),
    queryFn: () =>
      RcltpResultsService.getSchoolDashboard(institutionId as string),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
