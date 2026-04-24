'use client';

/**
 * General Settings hooks — React Query wrapper over
 * HostelGeneralSettingsService.
 *
 * Agent G — settings real-save (2026-04-24). Single-row per institution.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HostelGeneralSettingsService,
  type HostelGeneralSettings,
  type HostelGeneralSettingsUpsert,
} from '@/lib/services/campus-living/hostel-general-settings-service';

export const hostelGeneralSettingsKeys = {
  all: ['campus-living', 'general-settings'] as const,
  byInstitution: (institutionId: string | undefined) =>
    ['campus-living', 'general-settings', 'by-institution', institutionId] as const,
};

/**
 * Fetch the single general-settings row for an institution. Returns null when
 * no row exists yet (first-ever load) — caller should seed defaults in the
 * form state.
 */
export function useHostelGeneralSettings(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelGeneralSettingsKeys.byInstitution(institutionId),
    queryFn: () =>
      HostelGeneralSettingsService.getSettings(
        isSuperAdmin ? institutionId : institutionId,
      ),
    // For super_admin without an institutionId, we can't load a single-row —
    // page shows the "pick an institution" empty state.
    enabled: !!institutionId,
  });
}

/**
 * Upsert the single settings row. On success the per-institution query is
 * invalidated so the form re-syncs with the freshly-persisted server data
 * (including updated_at, the auto-created id, etc.).
 */
export function useUpsertHostelGeneralSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      institutionId,
      payload,
    }: {
      institutionId: string;
      payload: HostelGeneralSettingsUpsert;
    }) => {
      return HostelGeneralSettingsService.upsertSettings(institutionId, payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: hostelGeneralSettingsKeys.byInstitution(variables.institutionId),
      });
      queryClient.invalidateQueries({
        queryKey: hostelGeneralSettingsKeys.all,
      });
      toast.success('General settings saved');
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to save general settings: ${error.message ?? 'Unknown error'}`,
      );
    },
  });
}

export type { HostelGeneralSettings, HostelGeneralSettingsUpsert };
