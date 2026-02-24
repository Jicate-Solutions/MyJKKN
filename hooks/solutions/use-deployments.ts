'use client';

/**
 * Solutions Hub - Deployments Hooks
 * Purpose: React Query hooks for phase deployments CRUD operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUS_LABELS,
} from '@/lib/services/solutions';
import type {
  DeploymentFilters,
  DeploymentWithPhase,
  DeploymentEnvironment,
  DeploymentStatus,
  CreateDeploymentServiceInput,
  UpdateDeploymentServiceInput,
} from '@/lib/services/solutions';
import type { PhaseDeployment } from '@/lib/services/solutions/types';

// ============================================
// RE-EXPORT TYPES & CONSTANTS
// ============================================

export type {
  DeploymentFilters,
  DeploymentWithPhase,
  DeploymentEnvironment,
  DeploymentStatus,
};
export type CreateDeploymentInput = CreateDeploymentServiceInput;
export type UpdateDeploymentInput = UpdateDeploymentServiceInput;
export { DEPLOYMENT_ENVIRONMENTS, DEPLOYMENT_STATUS_LABELS };

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all deployments with optional filters
 */
export function useDeployments(filters?: DeploymentFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.list(filters),
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single deployment by ID
 */
export function useDeployment(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/deployments/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all deployments for a specific phase
 */
export function usePhaseDeployments(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.byPhase(phaseId),
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: { phase_id: phaseId } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch the latest deployment for a phase and environment
 */
export function useLatestDeployment(phaseId: string, environment: DeploymentEnvironment) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.latest(phaseId, environment),
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: { phase_id: phaseId, environment, latest: 'true' } }),
    enabled: !!phaseId && !!environment,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch deployment statistics (dashboard data)
 */
export function useDeploymentStats() {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.stats(),
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get active deployment URL for a phase and environment
 */
export function useActiveDeploymentUrl(phaseId: string, environment: DeploymentEnvironment) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.activeUrl(phaseId, environment),
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: { phase_id: phaseId, environment, active_url: 'true' } }),
    enabled: !!phaseId && !!environment,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Check if phase has any active deployments
 */
export function useHasActiveDeployments(phaseId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.deployments.byPhase(phaseId), 'has-active'],
    queryFn: () => apiClient.get('/api/solutions/deployments', { params: { phase_id: phaseId, has_active: 'true' } }),
    enabled: !!phaseId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new deployment
 */
export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeploymentInput) => apiClient.post<PhaseDeployment>('/api/solutions/deployments', input),
    onSuccess: (data: PhaseDeployment) => {
      // Invalidate deployment lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      // Invalidate phase-specific deployments
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
        // Also invalidate the phase detail (production URL may change)
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      }
    },
  });
}

/**
 * Update an existing deployment
 */
export function useUpdateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDeploymentInput }) =>
      apiClient.patch<PhaseDeployment>(`/api/solutions/deployments/${id}`, input),
    onSuccess: (data: PhaseDeployment) => {
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      // Update cache for this deployment
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.deployments.detail(data.id), data);
      }

      // Invalidate phase deployments
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
      }
    },
  });
}

/**
 * Deactivate a deployment
 */
export function useDeactivateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.patch<PhaseDeployment>(`/api/solutions/deployments/${id}`, { is_active: false }),
    onSuccess: (data: PhaseDeployment) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.deployments.detail(data.id), data);
      }

      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
      }
    },
  });
}

/**
 * Rollback to a previous deployment
 */
export function useRollbackDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      phaseId,
      environment,
      targetDeploymentId,
    }: {
      phaseId: string;
      environment: DeploymentEnvironment;
      targetDeploymentId: string;
    }) => apiClient.post<PhaseDeployment>('/api/solutions/deployments', { phase_id: phaseId, environment, rollback_from: targetDeploymentId, _action: 'rollback' }),
    onSuccess: (data: PhaseDeployment) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
        // Phase URL may change
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
      }
    },
  });
}

/**
 * Delete a deployment record
 */
export function useDeleteDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/deployments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });
    },
  });
}

/**
 * Deploy to staging
 */
export function useDeployToStaging() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateDeploymentInput, 'environment'>) =>
      apiClient.post<PhaseDeployment>('/api/solutions/deployments', { ...input, environment: 'staging' }),
    onSuccess: (data: PhaseDeployment) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.latest(data.phase_id, 'staging'),
        });
      }
    },
  });
}

/**
 * Deploy to production
 */
export function useDeployToProduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateDeploymentInput, 'environment'>) =>
      apiClient.post<PhaseDeployment>('/api/solutions/deployments', { ...input, environment: 'production' }),
    onSuccess: (data: PhaseDeployment) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.deployments.all });

      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.byPhase(data.phase_id),
        });
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.deployments.latest(data.phase_id, 'production'),
        });
        // Phase status changes to 'live' and production URL set
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      }
    },
  });
}
