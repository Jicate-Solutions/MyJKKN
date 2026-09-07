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

/**
 * The institution scope is part of the key, not just an argument.
 *
 * These queries are narrowed to the reader's accessible institutions in the
 * service, so two readers with different scopes must not share one cache
 * entry — otherwise a cross-institution reader's results could be served to
 * a single-college reader from cache. `null` means "not narrowed".
 */
function scopeKey(institutionIds: string[] | null): string {
  return institutionIds ? [...institutionIds].sort().join(',') : 'all';
}

export const departmentStatusReviewKeys = {
  all: ['solutions-hub', 'department-status-reviews'] as const,
  open: (institutionIds: string[] | null = null) =>
    [...departmentStatusReviewKeys.all, 'open', scopeKey(institutionIds)] as const,
  decided: (limit: number, institutionIds: string[] | null = null) =>
    [
      ...departmentStatusReviewKeys.all,
      'decided',
      limit,
      scopeKey(institutionIds),
    ] as const,
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
export function useOpenDepartmentStatusReviews(
  enabled = true,
  institutionIds: string[] | null = null
) {
  return useQuery<DepartmentStatusReviewWithDetails[]>({
    queryKey: departmentStatusReviewKeys.open(institutionIds),
    queryFn: () => DepartmentTrackerService.listOpenStatusReviews(institutionIds),
    enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Recently decided reviews — the audit trail beneath the queue.
 */
export function useDecidedDepartmentStatusReviews(
  limit = 20,
  enabled = true,
  institutionIds: string[] | null = null
) {
  return useQuery<DepartmentStatusReviewWithDetails[]>({
    queryKey: departmentStatusReviewKeys.decided(limit, institutionIds),
    queryFn: () =>
      DepartmentTrackerService.listDecidedStatusReviews(limit, institutionIds),
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
 * would leave the row visible in both places at once. Invalidating `all` also
 * covers every institution scope, since the scope is part of the key.
 *
 * That namespace is the ONLY thing invalidated, because it is the only React
 * Query data affected. An accepted review does rewrite
 * `sh_solution_departments.status`, but every other reader of that column —
 * `useSolutionDepartments`, `useDepartmentSummary`, `useDepartmentCapabilities`
 * — is a `useState`/`useEffect` hook with no query key at all, so no
 * invalidation can refresh them; they pick the new status up on their next
 * mount or page load. (`solutionsHubKeys.departmentTracker` exists in
 * `lib/query-keys.ts` but no query uses it, so invalidating it would be a
 * no-op dressed as a refresh.)
 */
export function useDecideDepartmentStatusReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, apply, note }: DecideStatusReviewInput) =>
      DepartmentTrackerService.decideStatusReview(reviewId, apply, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentStatusReviewKeys.all });
    },
  });
}
