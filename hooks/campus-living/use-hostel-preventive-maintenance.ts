'use client';

import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { PreventiveMaintenanceService } from '@/lib/services/campus-living/preventive-maintenance-service';

export const hostelPreventiveMaintenanceKeys = {
  all: ['hostel-preventive-maintenance'] as const,
  list: (filters: Record<string, unknown>) =>
    ['hostel-preventive-maintenance', 'list', filters] as const,
};

/**
 * Lists preventive-maintenance schedules for hostel-infrastructure resources.
 * Super admins see schedules across all institutions; everyone else sees their
 * own institution's schedules.
 */
export function usePreventiveMaintenance(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelPreventiveMaintenanceKeys.list({ institutionId }),
    queryFn: () =>
      PreventiveMaintenanceService.getSchedules(
        isSuperAdmin ? undefined : institutionId,
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}
