'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminCategoryUpgradeService } from '@/lib/services/campus-living/admin-category-upgrade-service';
import { hostelWaitlistKeys } from '@/hooks/campus-living/use-hostel-waitlist';
import type { BulkUpgradeInput } from '@/types/campus-living/admin-category-upgrade';

const adminUpgradeKeys = {
  catalog: ['campus-living', 'admin-upgrade', 'catalog'] as const,
  roomOptions: (learnerId: string) => ['campus-living', 'admin-upgrade', 'room-options', learnerId] as const,
  rooms: (learnerId: string, categoryId: string) =>
    ['campus-living', 'admin-upgrade', 'rooms', learnerId, categoryId] as const,
};

/** Selectable bulk targets (auto room categories + mess categories). */
export function useBulkUpgradeTargetCatalog(enabled = true) {
  return useQuery({
    queryKey: adminUpgradeKeys.catalog,
    queryFn: () => AdminCategoryUpgradeService.getTargetCatalog(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Dry-run preview — per-learner eligibility, no writes. */
export function useBulkUpgradePreview() {
  return useMutation({
    mutationFn: (input: BulkUpgradeInput) => AdminCategoryUpgradeService.preview(input),
  });
}

/** Commit — eligible learners are upgraded. Refreshes the cross-cutting caches
 *  (My Hostel, allocations, waitlist, upgrades report). The tab refreshes its
 *  own table via refetchKey. */
export function useBulkUpgradeCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkUpgradeInput) => AdminCategoryUpgradeService.commit(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-hostel'] });
      qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
      qc.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrade'] });
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrades-report'] });
    },
  });
}

// ── Single-learner room upgrade (manual categories — Phase 2) ───────────────

/** Eligible MANUAL room categories for one learner. */
export function useAdminRoomUpgradeOptions(learnerId: string | null) {
  return useQuery({
    queryKey: adminUpgradeKeys.roomOptions(learnerId ?? ''),
    queryFn: () => AdminCategoryUpgradeService.getRoomUpgradeOptions(learnerId!),
    enabled: !!learnerId,
  });
}

/** Available rooms of a target category for one learner. */
export function useAdminRoomOptions(learnerId: string | null, categoryId: string | null) {
  return useQuery({
    queryKey: adminUpgradeKeys.rooms(learnerId ?? '', categoryId ?? ''),
    queryFn: () => AdminCategoryUpgradeService.getRoomOptions(learnerId!, categoryId!),
    enabled: !!learnerId && !!categoryId,
  });
}

export function useAdminUpgradeRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { learnerId: string; categoryId: string; roomId: string; bedId?: string | null }) =>
      AdminCategoryUpgradeService.upgradeRoom(vars.learnerId, vars.categoryId, vars.roomId, vars.bedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-hostel'] });
      qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
      qc.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrade'] });
      qc.invalidateQueries({ queryKey: ['campus-living', 'admin-upgrade'] });
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrades-report'] });
    },
  });
}
