'use client';

/**
 * Solutions Hub - Builders Hooks
 * Purpose: React Query hooks for builder talent pool management
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-builders.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type BuilderRole = 'lead' | 'contributor';
export type AssignmentStatus = 'requested' | 'approved' | 'active' | 'completed' | 'withdrawn';

export interface BuilderFilters {
  department_id?: string;
  is_active?: boolean;
  specialization?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateBuilderInput {
  user_id?: string;
  name: string;
  email?: string;
  department_id?: string;
  trained_date?: string;
  specialization?: string;
}

export interface UpdateBuilderInput {
  name?: string;
  email?: string;
  department_id?: string;
  trained_date?: string;
  specialization?: string;
  is_active?: boolean;
}

export interface AddSkillInput {
  builder_id: string;
  skill_name: string;
  proficiency_level?: number;
}

export interface CreateAssignmentInput {
  phase_id: string;
  builder_id: string;
  role?: BuilderRole;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BuilderService = any;

const buildersService: BuilderService = {
  getBuilders: async (_filters?: BuilderFilters) => {
    throw new Error('buildersService.getBuilders not implemented');
  },
  getBuilderById: async (_id: string) => {
    throw new Error('buildersService.getBuilderById not implemented');
  },
  createBuilder: async (_input: CreateBuilderInput) => {
    throw new Error('buildersService.createBuilder not implemented');
  },
  updateBuilder: async (_id: string, _input: UpdateBuilderInput) => {
    throw new Error('buildersService.updateBuilder not implemented');
  },
  deleteBuilder: async (_id: string) => {
    throw new Error('buildersService.deleteBuilder not implemented');
  },
  addBuilderSkill: async (_input: AddSkillInput) => {
    throw new Error('buildersService.addBuilderSkill not implemented');
  },
  updateBuilderSkill: async (_id: string, _input: { proficiency_level: number }) => {
    throw new Error('buildersService.updateBuilderSkill not implemented');
  },
  removeBuilderSkill: async (_id: string) => {
    throw new Error('buildersService.removeBuilderSkill not implemented');
  },
  requestAssignment: async (_input: CreateAssignmentInput) => {
    throw new Error('buildersService.requestAssignment not implemented');
  },
  approveAssignment: async (_id: string, _approverId: string) => {
    throw new Error('buildersService.approveAssignment not implemented');
  },
  startAssignment: async (_id: string) => {
    throw new Error('buildersService.startAssignment not implemented');
  },
  completeAssignment: async (_id: string) => {
    throw new Error('buildersService.completeAssignment not implemented');
  },
  withdrawAssignment: async (_id: string) => {
    throw new Error('buildersService.withdrawAssignment not implemented');
  },
  getPendingAssignmentRequests: async () => {
    throw new Error('buildersService.getPendingAssignmentRequests not implemented');
  },
  getAssignmentsByStatus: async (_status: AssignmentStatus) => {
    throw new Error('buildersService.getAssignmentsByStatus not implemented');
  },
  getBuilderStats: async () => {
    throw new Error('buildersService.getBuilderStats not implemented');
  },
  getAvailableBuildersForPhase: async (_phaseId: string) => {
    throw new Error('buildersService.getAvailableBuildersForPhase not implemented');
  },
  checkAssignmentApproval: async (_phaseId: string) => {
    throw new Error('buildersService.checkAssignmentApproval not implemented');
  },
};

// ============================================
// QUERY HOOKS - BUILDERS
// ============================================

/**
 * Fetch all builders with optional filters
 */
export function useBuilders(filters?: BuilderFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.list(filters),
    queryFn: () => buildersService.getBuilders(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single builder by ID
 */
export function useBuilder(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.detail(id),
    queryFn: () => buildersService.getBuilderById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch builder statistics (dashboard data)
 */
export function useBuilderStats() {
  return useQuery({
    queryKey: solutionsHubKeys.builders.stats(),
    queryFn: () => buildersService.getBuilderStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch available builders for a specific phase
 */
export function useAvailableBuildersForPhase(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.available(phaseId),
    queryFn: () => buildersService.getAvailableBuildersForPhase(phaseId),
    enabled: !!phaseId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - ASSIGNMENTS
// ============================================

/**
 * Fetch pending assignment requests (for approval workflow)
 */
export function usePendingAssignmentRequests() {
  return useQuery({
    queryKey: solutionsHubKeys.builderAssignments.pending(),
    queryFn: () => buildersService.getPendingAssignmentRequests(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch assignments by status
 */
export function useAssignmentsByStatus(status: AssignmentStatus) {
  return useQuery({
    queryKey: solutionsHubKeys.builderAssignments.byStatus(status),
    queryFn: () => buildersService.getAssignmentsByStatus(status),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Check if assignment needs approval based on value thresholds
 */
export function useCheckAssignmentApproval(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderAssignments.approvalCheck(phaseId),
    queryFn: () => buildersService.checkAssignmentApproval(phaseId),
    enabled: !!phaseId,
    staleTime: 0,
  });
}

// ============================================
// MUTATION HOOKS - BUILDERS
// ============================================

/**
 * Create a new builder
 */
export function useCreateBuilder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBuilderInput) => buildersService.createBuilder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Update an existing builder
 */
export function useUpdateBuilder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBuilderInput }) =>
      buildersService.updateBuilder(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.builders.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a builder
 */
export function useDeleteBuilder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => buildersService.deleteBuilder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - SKILLS
// ============================================

/**
 * Add a skill to a builder
 */
export function useAddBuilderSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddSkillInput) => buildersService.addBuilderSkill(input),
    onSuccess: (data) => {
      if (data?.builder_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.builders.detail(data.builder_id),
        });
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Update a builder's skill proficiency
 */
export function useUpdateBuilderSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { proficiency_level: number };
    }) => buildersService.updateBuilderSkill(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Remove a skill from a builder
 */
export function useRemoveBuilderSkill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => buildersService.removeBuilderSkill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - ASSIGNMENTS
// ============================================

/**
 * Request an assignment to a phase
 */
export function useRequestAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAssignmentInput) => buildersService.requestAssignment(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
      }
      if (data?.builder_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.builders.detail(data.builder_id),
        });
      }
    },
  });
}

/**
 * Approve an assignment request (HOD/MD)
 */
export function useApproveAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approverId }: { id: string; approverId: string }) =>
      buildersService.approveAssignment(id, approverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Start working on an assignment
 */
export function useStartAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => buildersService.startAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Complete an assignment
 */
export function useCompleteAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => buildersService.completeAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}

/**
 * Withdraw from an assignment
 */
export function useWithdrawAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => buildersService.withdrawAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}
