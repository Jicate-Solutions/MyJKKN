'use client';

/**
 * Solutions Hub - Phases Hooks
 * Purpose: React Query hooks for solution phases CRUD and related operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  PHASE_STATUSES,
} from '@/lib/services/solutions';
import type {
  PhaseFilters as ServicePhaseFilters,
  PhaseWithDetails,
  UpdatePhaseInput as ServiceUpdatePhaseInput,
  CreateIterationInput as ServiceCreateIterationInput,
  CreateBugReportInput as ServiceCreateBugReportInput,
  CreateDeploymentInput as ServiceCreateDeploymentInput,
} from '@/lib/services/solutions';
import type {
  PhaseStatus,
  SolutionPhase,
  PrototypeIteration,
  BugReport,
  PhaseDeployment,
  CreatePhaseInput as ServiceCreatePhaseInput,
} from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES & CONSTANTS
// ============================================

export type { PhaseStatus, PhaseWithDetails };
export { PHASE_STATUSES };

export interface PhaseFilters extends ServicePhaseFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface CreatePhaseInput {
  solution_id: string;
  title: string;
  description?: string;
  owner_department_id?: string;
  estimated_value?: number;
  start_date?: string;
  due_date?: string;
}

export interface UpdatePhaseInput extends ServiceUpdatePhaseInput {}

export interface CreateIterationInput {
  phase_id: string;
  prototype_url: string;
  changes_made?: string;
  demo_date?: string;
}

export interface CreateBugReportInput {
  iteration_id: string;
  reported_by: string;
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  screenshots_urls?: string[];
}

export interface CreateDeploymentInput {
  phase_id: string;
  environment: 'staging' | 'production';
  version?: string;
  vercel_url?: string;
  supabase_project_id?: string;
  custom_domain?: string;
  deployed_date: string;
  deployed_by: string;
  notes?: string;
}

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all phases with optional filters
 */
export function usePhases(filters?: PhaseFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.list(filters),
    queryFn: () => apiClient.get('/api/solutions/phases', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single phase by ID
 */
export function usePhase(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/phases/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all phases for a specific solution
 */
export function useSolutionPhases(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.bySolution(solutionId),
    queryFn: () => apiClient.get('/api/solutions/phases', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch phase statistics (dashboard data)
 */
export function usePhaseStats() {
  return useQuery({
    queryKey: solutionsHubKeys.phases.stats(),
    queryFn: () => apiClient.get('/api/solutions/phases/stats'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get the next phase number for a solution
 */
export function useNextPhaseNumber(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.nextNumber(solutionId),
    queryFn: () => apiClient.get('/api/solutions/phases', { params: { solution_id: solutionId, next_number: 'true' } }),
    enabled: !!solutionId,
    staleTime: 0, // Always fetch fresh
  });
}

/**
 * Get active phases (in progress)
 */
export function useActivePhases() {
  return useQuery({
    queryKey: [...solutionsHubKeys.phases.all, 'active'],
    queryFn: async () => {
      const activeStatuses: PhaseStatus[] = [
        'prospecting',
        'discovery',
        'prd_writing',
        'prototype_building',
        'client_demo',
        'revisions',
        'approved',
        'deploying',
        'training',
      ];
      // Fetch phases that are not completed, on_hold, cancelled, live, or in_amc
      const result = await apiClient.get<{ data: any[]; [key: string]: any }>('/api/solutions/phases', { params: { limit: 100 } });
      return {
        ...result,
        data: result.data.filter((phase: any) => activeStatuses.includes(phase.status as PhaseStatus)),
      };
    },
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS - PHASES
// ============================================

/**
 * Create a new phase
 */
export function useCreatePhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePhaseInput) =>
      apiClient.post<SolutionPhase>('/api/solutions/phases', input),
    onSuccess: (data: SolutionPhase) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      if (data?.solution_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.bySolution(data.solution_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.nextNumber(data.solution_id),
        });
      }
    },
  });
}

/**
 * Update an existing phase
 */
export function useUpdatePhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePhaseInput }) =>
      apiClient.patch<SolutionPhase>(`/api/solutions/phases/${id}`, input),
    onSuccess: (data: SolutionPhase) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.phases.detail(data.id), data);
      }
    },
  });
}

/**
 * Update phase status
 */
export function useUpdatePhaseStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PhaseStatus }) =>
      apiClient.patch<SolutionPhase>(`/api/solutions/phases/${id}/status`, { status }),
    onSuccess: (data: SolutionPhase) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.phases.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a phase
 */
export function useDeletePhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/phases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - ITERATIONS (convenience wrappers)
// ============================================

/**
 * Create a prototype iteration
 */
export function useCreateIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateIterationInput) =>
      apiClient.post<PrototypeIteration>('/api/solutions/iterations', input),
    onSuccess: (data: PrototypeIteration) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
      }
    },
  });
}

/**
 * Update a prototype iteration (feedback, approval)
 */
export function useUpdateIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { feedback?: string; client_approved?: boolean };
    }) => apiClient.patch<PrototypeIteration>(`/api/solutions/iterations/${id}`, input),
    onSuccess: (data: PrototypeIteration) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.iterations.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.byPhase(data.phase_id),
        });
      }
    },
  });
}

// ============================================
// MUTATION HOOKS - BUG REPORTS (convenience wrappers)
// ============================================

/**
 * Create a bug report for an iteration
 */
export function useCreateBugReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBugReportInput) =>
      apiClient.post<BugReport>('/api/solutions/bugs', input),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });
      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.iterations.detail(data.iteration_id),
        });
      }
    },
  });
}

/**
 * Update a bug report (status, resolution)
 */
export function useUpdateBugReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { status?: string; resolved_by?: string; resolution_notes?: string };
    }) =>
      apiClient.patch<BugReport>(`/api/solutions/bugs/${id}`, {
        status: input.status as 'open' | 'in_progress' | 'resolved' | 'closed' | undefined,
        resolved_by: input.resolved_by,
        resolution_notes: input.resolution_notes,
      }),
    onSuccess: (data: BugReport) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.bugs.all });
      if (data?.iteration_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.bugs.byIteration(data.iteration_id),
        });
      }
    },
  });
}

// ============================================
// MUTATION HOOKS - DEPLOYMENTS (convenience wrappers)
// ============================================

/**
 * Create a deployment record
 */
export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeploymentInput) =>
      apiClient.post<PhaseDeployment>('/api/solutions/deployments', input),
    onSuccess: (data: PhaseDeployment) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      }
    },
  });
}
