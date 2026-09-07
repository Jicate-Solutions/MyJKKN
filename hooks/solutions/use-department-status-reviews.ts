'use client';

/**
 * Solutions Hub — Department Status Review Hooks
 * Purpose: React Query hooks for the dormancy review queue
 * Connected to: lib/services/solutions/department-tracker-service.ts
 *
 * `update_department_statuses()` proposes into `sh_department_status_reviews`
 * and stops. Until these hooks existed nothing in the application read that
 * table, so a proposal could be written and never acted on — which is the
 * silence the queue was built to break.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';
import type { DepartmentStatusReviewWithDetails } from '@/lib/services/solutions/department-tracker-service';

// ============================================
// RE-EXPORT TYPES FOR CONVENIENCE
// ============================================

export type { DepartmentStatusReviewWithDetails };

// ============================================
// QUERY KEYS
// ============================================

export const departmentStatusReviewKeys = {
  all: ['solutions-hub', 'department-status-reviews'] as const,
  open: () => [...departmentStatusReviewKeys.all, 'open'] as const,
  decided: (limit: number) =>
    [...departmentStatusReviewKeys.all, 'decided', limit] as const,
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Open reviews — proposals nobody has decided yet.
 *
 * `enabled` carries the read permission rather than the component hiding a
 * fired query's result: RLS on `sh_department_status_reviews` answers a
 * forbidden SELECT with zero rows, not an error, so a query fired without the
 * permission would look identical to an empty queue. Not firing it lets the
 * screen say which of the two it is (CLAUDE.md rule 27).
 */
export function useOpenDepartmentStatusReviews(enabled = true) {
  return useQuery<DepartmentStatusReviewWithDetails[]>({
    queryKey: departmentStatusReviewKeys.open(),
    queryFn: () => DepartmentTrackerService.listOpenStatusReviews(),
    enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Recently decided reviews — the audit trail beneath the queue.
 */
export function useDecidedDepartmentStatusReviews(limit = 20, enabled = true) {
  return useQuery<DepartmentStatusReviewWithDetails[]>({
    queryKey: departmentStatusReviewKeys.decided(limit),
    queryFn: () => DepartmentTrackerService.listDecidedStatusReviews(limit),
    enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

export interface DecideStatusReviewInput {
  reviewId: string;
  apply: boolean;
  note?: string | null;
}

/**
 * Accept (`apply: true`) or reject (`apply: false`) one open review.
 *
 * Invalidates the whole review namespace on success: an accepted proposal moves
 * from the open list to the decided list, so refreshing only one of the two
 * would leave the row visible in both places at once.
 */
export function useDecideDepartmentStatusReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, apply, note }: DecideStatusReviewInput) =>
      DepartmentTrackerService.decideStatusReview(reviewId, apply, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentStatusReviewKeys.all });
      // An accepted review rewrites sh_solution_departments.status, which every
      // department list on the hub renders.
      queryClient.invalidateQueries({ queryKey: ['solutions-hub', 'departments'] });
    },
  });
}
