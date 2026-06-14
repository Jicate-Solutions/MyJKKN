/**
 * EKSAQ RCLTP v2 — Gamification hooks (Phase 2)
 * ----------------------------------------------------------------------------
 * Reads: badge catalog, a learner's earned badges, streaks.
 * Staff mutations: badge-catalog CRUD (rcltp.reward.config).
 * NO award/streak mutations — those are server-side only (fn_rcltp_award_badge /
 * fn_rcltp_update_streak via the Phase-3 score-flow route); a student cannot
 * self-award. The service award helpers throw if called from the client.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RcltpGamificationService } from '@/lib/services/rcltp/gamification-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  RcltpBadgeFilters,
  RcltpLearnerBadgeFilters,
  RcltpStreakFilters,
  CreateRcltpBadgeDto,
  UpdateRcltpBadgeDto,
} from '@/types/rcltp';

export const rcltpBadgeKeys = {
  all: ['rcltp', 'badges'] as const,
  list: (filters: RcltpBadgeFilters) => [...rcltpBadgeKeys.all, 'list', filters] as const,
  detail: (id: string) => [...rcltpBadgeKeys.all, 'detail', id] as const,
};

export const rcltpLearnerBadgeKeys = {
  all: ['rcltp', 'learner-badges'] as const,
  list: (filters: RcltpLearnerBadgeFilters) =>
    [...rcltpLearnerBadgeKeys.all, 'list', filters] as const,
};

export const rcltpStreakKeys = {
  all: ['rcltp', 'streaks'] as const,
  list: (filters: RcltpStreakFilters) => [...rcltpStreakKeys.all, 'list', filters] as const,
};

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

export function useRcltpBadges(filters: RcltpBadgeFilters = {}) {
  return useQuery({
    queryKey: rcltpBadgeKeys.list(filters),
    queryFn: () => RcltpGamificationService.getBadges(filters),
    placeholderData: (prev) => prev,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpBadge(id: string) {
  return useQuery({
    queryKey: rcltpBadgeKeys.detail(id),
    queryFn: () => RcltpGamificationService.getBadgeById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useRcltpLearnerBadges(filters: RcltpLearnerBadgeFilters = {}) {
  return useQuery({
    queryKey: rcltpLearnerBadgeKeys.list(filters),
    queryFn: () => RcltpGamificationService.getLearnerBadges(filters),
    enabled: !!(filters.learner_id || filters.badge_id),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRcltpStreaks(filters: RcltpStreakFilters = {}) {
  return useQuery({
    queryKey: rcltpStreakKeys.list(filters),
    queryFn: () => RcltpGamificationService.getStreaks(filters),
    enabled: !!filters.learner_id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ---------------------------------------------------------------------------
// STAFF/ADMIN BADGE-CATALOG MUTATIONS (RLS permits these client writes)
// ---------------------------------------------------------------------------

export function useCreateRcltpBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRcltpBadgeDto) =>
      RcltpGamificationService.createBadge(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpBadgeKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to create badge'),
  });
}

export function useUpdateRcltpBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRcltpBadgeDto }) =>
      RcltpGamificationService.updateBadge(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpBadgeKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to update badge'),
  });
}

export function useDeleteRcltpBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RcltpGamificationService.deleteBadge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rcltpBadgeKeys.all }),
    onError: (e: any) => toast.error(e?.message || 'Failed to delete badge'),
  });
}
