'use client';

/**
 * Maintenance SLA hooks — thin re-export wrapper + a batch-upsert hook
 * for the matrix editor on /campus-living/settings/maintenance-sla.
 *
 * Wired 2026-04-24 (Agent D — settings real-save).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  campusLivingSettingsKeys,
  useHostelSlaConfigs,
  useHostelSlaConfig,
  useCreateHostelSlaConfig,
  useUpdateHostelSlaConfig,
  useDeleteHostelSlaConfig,
} from './use-campus-living-settings';
import { CampusLivingSettings } from '@/lib/services/campus-living/campus-living-settings';
import type { HostelMaintenanceSlaConfig } from '@/types/campus-living';

export {
  campusLivingSettingsKeys,
  useHostelSlaConfigs,
  useHostelSlaConfig,
  useCreateHostelSlaConfig,
  useUpdateHostelSlaConfig,
  useDeleteHostelSlaConfig,
};

/**
 * Batch upsert for the 7x4 SLA grid (7 categories x 4 priorities = 28 rows).
 * Called by the matrix "Save Changes" button — walks every dirty cell and
 * creates/updates rows in parallel. Errors aggregated into the toast.
 */
export function useUpsertHostelSlaConfigs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: Array<
        Partial<HostelMaintenanceSlaConfig> & {
          institution_id: string;
          category: HostelMaintenanceSlaConfig['category'];
          priority: HostelMaintenanceSlaConfig['priority'];
          sla_hours: number;
        }
      >,
    ) => {
      const results = await Promise.allSettled(
        rows.map(async (row) => {
          if (row.id) {
            return CampusLivingSettings.updateSlaConfig(row.id, row);
          }
          return CampusLivingSettings.createSlaConfig(
            row as Omit<HostelMaintenanceSlaConfig, 'id' | 'created_at' | 'updated_at'>,
          );
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(
          `${failed.length} of ${rows.length} SLA rows failed to save. First error: ${
            (failed[0] as PromiseRejectedResult).reason?.message ?? 'unknown'
          }`,
        );
      }
      return results.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: campusLivingSettingsKeys.all });
      toast.success(`Saved ${count} SLA configuration${count === 1 ? '' : 's'}`);
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Failed to save SLA configurations');
    },
  });
}
