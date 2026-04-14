'use client';

/**
 * Solutions Hub - Bugs Hooks
 * Purpose: React Query hooks for bug reports CRUD operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
} from '@/lib/services/solutions';
import type {
  BugFilters,
  BugWithDetails,
  BugSeverity,
  BugStatus,
  CreateBugInput,
  UpdateBugInput,
} from '@/lib/services/solutions';
import type { BugReport } from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES & CONSTANTS
// ============================================

export type { BugFilters, BugWithDetails, BugSeverity, BugStatus, CreateBugInput, UpdateBugInput };
export { BUG_SEVERITY_LABELS, BUG_STATUS_LABELS };

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all bugs with optional filters
 */
export function useBugs(filters?: BugFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.list(filters),
    queryFn: () => apiClient.get('/api/solutions/bugs', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single bug by ID
 */
export function useBug(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/bugs/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all bugs for a specific phase (across all iterations)
 */
export function usePhaseBugs(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.byPhase(phaseId),
    queryFn: () => apiClient.get('/api/solutions/bugs', { params: { phase_id: phaseId } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch all bugs for a specific iteration
 */
export function useIterationBugs(iterationId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.byIteration(iterationId),
    queryFn: () => apiClient.get('/api/solutions/bugs', { params: { iteration_id: iterationId } }),
    enabled: !!iterationId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch bug statistics (dashboard data)
 */
export function useBugStats() {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.stats(),
    queryFn: () => apiClient.get('/api/solutions/bugs', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get open bug count for a phase
 */
export function useOpenBugCount(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.bugs.openCount(phaseId),
    queryFn: () => apiClient.get('/api/solutions/bugs', { params: { phase_id: phaseId, count_open: 'true' } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new bug report
 */
export function useCreateBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBugInput) => apiClient.post<BugReport>('/api/solutions/bugs', input),
    onSuccess: (data: BugReport) => {
      // Invalidate bug lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      // Invalidate iteration-specific bugs
      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
        // Also invalidate the iteration detail (bug count changed)
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.detail(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Update an existing bug report
 */
export function useUpdateBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBugInput }) =>
      apiClient.patch<BugReport>(`/api/solutions/bugs/${id}`, input),
    onSuccess: (data: BugReport) => {
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      // Update cache for this bug
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }

      // Invalidate iteration bugs
      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Resolve a bug
 */
export function useResolveBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      resolvedBy,
      resolutionNotes,
    }: {
      id: string;
      resolvedBy: string;
      resolutionNotes?: string;
    }) => apiClient.patch<BugReport>(`/api/solutions/bugs/${id}/status`, { status: 'resolved', resolved_by: resolvedBy, resolution_notes: resolutionNotes }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }

      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Close a bug
 */
export function useCloseBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.patch<BugReport>(`/api/solutions/bugs/${id}/status`, { status: 'closed' }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }

      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Reopen a bug
 */
export function useReopenBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.patch<BugReport>(`/api/solutions/bugs/${id}/status`, { status: 'open' }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }

      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Delete a bug report
 */
export function useDeleteBug() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/bugs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });
    },
  });
}

/**
 * Change bug severity
 */
export function useChangeBugSeverity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, severity }: { id: string; severity: BugSeverity }) =>
      apiClient.patch<BugReport>(`/api/solutions/bugs/${id}`, { severity }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }
    },
  });
}

/**
 * Change bug status
 */
export function useChangeBugStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }) =>
      apiClient.patch<BugReport>(`/api/solutions/bugs/${id}`, { status }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.bugs.detail(data.id), data);
      }

      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}
