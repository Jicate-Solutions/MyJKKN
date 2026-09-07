'use client';

/**
 * Solutions Hub — Community Engagement Register hooks
 *
 * Connected to: lib/services/solutions/societal-service.ts
 *
 * These call the service DIRECTLY rather than going through apiClient like
 * hooks/solutions/use-discovery.ts does. Two reasons, both deliberate: an API
 * route would run as the server client and hide the per-institution scoping the
 * RLS policies exist to apply (same reasoning as hooks/use-department-capabilities.ts),
 * and this feature is under a hard instruction to add no new routes — Vercel
 * route headroom on this project is 19.
 *
 * Approving an engagement fires trg_community_engagement_touches_dept, which
 * writes sh_solution_departments.last_activity_at and can flip a department out
 * of at_risk/dormant. That changes the paradigm-shift numbers, so a successful
 * decision invalidates those queries too.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  SocietalService,
  type CommunityEngagement,
  type DepartmentSolutionOption,
  type EngagementApprovalStatus,
  type RecordEngagementInput,
} from '@/lib/services/solutions/societal-service';

export type {
  CommunityEngagement,
  DepartmentSolutionOption,
  EngagementApprovalStatus,
  RecordEngagementInput,
};

/**
 * Local query keys. `lib/query-keys.ts` is outside this change's blast radius,
 * so the register keeps its own namespace under the same 'solutions-hub' root.
 */
export const communityEngagementKeys = {
  all: ['solutions-hub', 'community-engagements'] as const,
  byDepartment: (departmentId: string) =>
    ['solutions-hub', 'community-engagements', 'department', departmentId] as const,
  departmentSolutions: (departmentId: string) =>
    ['solutions-hub', 'community-engagements', 'solution-options', departmentId] as const,
};

// ============================================
// QUERIES
// ============================================

/** Every engagement recorded against one department that the caller may see. */
export function useCommunityEngagements(departmentId: string) {
  return useQuery({
    queryKey: communityEngagementKeys.byDepartment(departmentId),
    queryFn: () => SocietalService.listByDepartment(departmentId),
    enabled: !!departmentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Solutions this department leads, for the optional link on the record form.
 * Only fetched while the form is open — passing `enabled: false` keeps the
 * detail page from paying for a list nobody has asked to see.
 */
export function useDepartmentSolutionOptions(departmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: communityEngagementKeys.departmentSolutions(departmentId),
    queryFn: () => SocietalService.listDepartmentSolutions(departmentId),
    enabled: !!departmentId && enabled,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATIONS
// ============================================

/** Record an engagement. It lands `pending` — the INSERT policy allows nothing else. */
export function useRecordCommunityEngagement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RecordEngagementInput) => SocietalService.record(input),
    onSuccess: (engagement: CommunityEngagement) => {
      queryClient.invalidateQueries({
        queryKey: communityEngagementKeys.byDepartment(engagement.department_id),
      });
    },
  });
}

/**
 * Approve or reject a pending engagement. An approval is the only event in the
 * platform that writes last_activity_at, so the paradigm-shift figures are
 * invalidated alongside the register itself.
 */
export function useDecideCommunityEngagement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      engagementId,
      decision,
      reviewNote,
    }: {
      engagementId: string;
      decision: 'approved' | 'rejected';
      reviewNote?: string | null;
    }) => SocietalService.decide(engagementId, decision, reviewNote),
    onSuccess: (engagement: CommunityEngagement) => {
      queryClient.invalidateQueries({
        queryKey: communityEngagementKeys.byDepartment(engagement.department_id),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.paradigmShift.all });
    },
  });
}
