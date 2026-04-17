// hooks/okr/use-tier1.ts
// React Query hooks for OKR TIER 1 features: Dependencies, Tasks (RACI), Risks

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import {
  OKRDependency,
  OKRTask,
  OKRRisk,
  CreateOKRDependencyDTO,
  CreateOKRTaskDTO,
  CreateOKRRiskDTO,
  DependencyStatus
} from '@/types/okr';
import {
  OKRDependencyService,
  OKRTaskService,
  OKRRiskService
} from '@/lib/services/okr';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { objectiveKeys } from './use-objectives';
import { useAuth } from '../use-auth';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const dependencyKeys = {
  all: ['okr-dependencies'] as const,
  byObjective: (objectiveId: string) =>
    [...dependencyKeys.all, 'objective', objectiveId] as const
};

export const taskKeys = {
  all: ['okr-tasks'] as const,
  byObjective: (objectiveId: string) =>
    [...taskKeys.all, 'objective', objectiveId] as const
};

export const riskKeys = {
  all: ['okr-risks'] as const,
  byObjective: (objectiveId: string) =>
    [...riskKeys.all, 'objective', objectiveId] as const
};

// ============================================================================
// DEPENDENCIES HOOKS
// ============================================================================

/**
 * Get dependencies for an objective
 */
export function useDependenciesByObjective(
  objectiveId: string
): UseQueryResult<OKRDependency[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: dependencyKeys.byObjective(objectiveId),
    queryFn: () => OKRDependencyService.getDependenciesByObjective(objectiveId),
    enabled: !authLoading && !!profile && !!objectiveId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create dependency mutation
 */
export function useCreateDependency(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRDependencyDTO) =>
      OKRDependencyService.createDependency(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dependencyKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Update dependency status mutation
 */
export function useUpdateDependencyStatus(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      resolutionNotes
    }: {
      id: string;
      status: DependencyStatus;
      resolutionNotes?: string;
    }) => OKRDependencyService.updateDependencyStatus(id, status, resolutionNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dependencyKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Delete dependency mutation
 */
export function useDeleteDependency(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRDependencyService.deleteDependency(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dependencyKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

// ============================================================================
// TASKS (RACI) HOOKS
// ============================================================================

/**
 * Get tasks for an objective
 */
export function useTasksByObjective(
  objectiveId: string
): UseQueryResult<OKRTask[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: taskKeys.byObjective(objectiveId),
    queryFn: () => OKRTaskService.getTasksByObjective(objectiveId),
    enabled: !authLoading && !!profile && !!objectiveId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create task mutation
 */
export function useCreateTask(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRTaskDTO) => OKRTaskService.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Update task mutation
 */
export function useUpdateTask(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: Partial<CreateOKRTaskDTO & { status: string }>;
    }) => OKRTaskService.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Delete task mutation
 */
export function useDeleteTask(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRTaskService.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Reorder tasks mutation
 */
export function useReorderTasks(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      OKRTaskService.reorderTasks(objectiveId, orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.byObjective(objectiveId)
      });
    }
  });
}

// ============================================================================
// RISKS HOOKS
// ============================================================================

/**
 * Get risks for an objective
 */
export function useRisksByObjective(
  objectiveId: string
): UseQueryResult<OKRRisk[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: riskKeys.byObjective(objectiveId),
    queryFn: () => OKRRiskService.getRisksByObjective(objectiveId),
    enabled: !authLoading && !!profile && !!objectiveId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create risk mutation
 */
export function useCreateRisk(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRRiskDTO) => OKRRiskService.createRisk(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: riskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Update risk mutation
 */
export function useUpdateRisk(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: Partial<CreateOKRRiskDTO & { status: string }>;
    }) => OKRRiskService.updateRisk(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: riskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

/**
 * Delete risk mutation
 */
export function useDeleteRisk(objectiveId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRRiskService.deleteRisk(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: riskKeys.byObjective(objectiveId)
      });
      queryClient.invalidateQueries({
        queryKey: objectiveKeys.detail(objectiveId)
      });
    }
  });
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { OKRRiskService } from '@/lib/services/okr';
