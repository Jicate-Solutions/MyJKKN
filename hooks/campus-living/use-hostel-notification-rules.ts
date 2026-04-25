'use client';

/**
 * Notification Rules hooks — React Query wrapper over
 * HostelNotificationRulesService.
 *
 * Agent G — settings real-save (2026-04-24). Pattern matches Agent D's
 * use-hostel-maintenance-sla (matrix editor with batch upsert).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import {
  HostelNotificationRulesService,
  type HostelNotificationRule,
  type HostelNotificationRuleUpsert,
} from '@/lib/services/campus-living/hostel-notification-rules-service';

export const hostelNotificationRulesKeys = {
  all: ['campus-living', 'notification-rules'] as const,
  list: (institutionId: string | undefined) =>
    ['campus-living', 'notification-rules', 'list', institutionId] as const,
};

/**
 * List notification rules for the current institution. Super admins get the
 * undefined branch (no institution filter) to see the global view.
 */
export function useHostelNotificationRules(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  const effective = isSuperAdmin ? institutionId : institutionId;
  return useQuery({
    queryKey: hostelNotificationRulesKeys.list(effective),
    queryFn: () =>
      HostelNotificationRulesService.listRules(
        isSuperAdmin ? institutionId : institutionId,
      ),
    // Super admins can load even without an institutionId (RLS handles scoping).
    enabled: isSuperAdmin || !!institutionId,
  });
}

/**
 * Batch upsert for the notification rules matrix. Called by the Save button
 * with only the dirty rows. Invalidates the list query on success so the grid
 * re-renders with the freshly-persisted values + any server-assigned ids.
 */
export function useUpsertHostelNotificationRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      institutionId,
      rows,
      updatedBy,
    }: {
      institutionId: string;
      rows: HostelNotificationRuleUpsert[];
      updatedBy: string | null;
    }) => {
      return HostelNotificationRulesService.upsertRules(
        institutionId,
        rows,
        updatedBy,
      );
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({
        queryKey: hostelNotificationRulesKeys.all,
      });
      toast.success(
        `Saved ${count} notification rule${count === 1 ? '' : 's'}`,
      );
    },
    onError: (error: Error) => {
      toast.error(
        `Failed to save notification rules: ${error.message ?? 'Unknown error'}`,
      );
    },
  });
}

export type { HostelNotificationRule, HostelNotificationRuleUpsert };
