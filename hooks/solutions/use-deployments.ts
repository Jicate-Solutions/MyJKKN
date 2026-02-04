'use client';

/**
 * Solutions Hub - Deployments Hooks
 * Purpose: React Query hooks for phase deployments CRUD operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  deploymentsService,
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUS_LABELS,
  type DeploymentFilters,
  type DeploymentWithPhase,
  type DeploymentEnvironment,
  type DeploymentStatus,
  type CreateDeploymentServiceInput,
  type UpdateDeploymentServiceInput,
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
    queryFn: () => deploymentsService.getDeployments(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single deployment by ID
 */
export function useDeployment(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.detail(id),
    queryFn: () => deploymentsService.getDeploymentById(id),
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
    queryFn: () => deploymentsService.getDeploymentsByPhase(phaseId),
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
    queryFn: () => deploymentsService.getLatestDeployment(phaseId, environment),
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
    queryFn: () => deploymentsService.getDeploymentStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get active deployment URL for a phase and environment
 */
export function useActiveDeploymentUrl(phaseId: string, environment: DeploymentEnvironment) {
  return useQuery({
    queryKey: solutionsHubKeys.deployments.activeUrl(phaseId, environment),
    queryFn: () => deploymentsService.getActiveDeploymentUrl(phaseId, environment),
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
    queryFn: () => deploymentsService.hasActiveDeployments(phaseId),
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
    mutationFn: (input: CreateDeploymentInput) => deploymentsService.createDeployment(input),
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
      deploymentsService.updateDeployment(id, input),
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
    mutationFn: (id: string) => deploymentsService.deactivateDeployment(id),
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
    }) => deploymentsService.rollbackDeployment(phaseId, environment, targetDeploymentId),
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
    mutationFn: (id: string) => deploymentsService.deleteDeployment(id),
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
      deploymentsService.createDeployment({ ...input, environment: 'staging' }),
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
      deploymentsService.createDeployment({ ...input, environment: 'production' }),
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
