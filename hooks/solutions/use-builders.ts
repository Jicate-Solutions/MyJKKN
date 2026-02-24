'use client';

/**
 * Solutions Hub - Builders Hooks
 * Purpose: React Query hooks for builder talent pool management
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-builders.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type { CreateBuilderInput } from '@/lib/services/solutions/types';

// ============================================
// TYPES (Re-exported from service for convenience)
// ============================================

export type { CreateBuilderInput };
export type BuilderRole = 'lead' | 'contributor';
export type AssignmentStatus = 'requested' | 'approved' | 'active' | 'completed' | 'withdrawn';

export interface BuilderFilters {
  [key: string]: string | number | boolean | undefined;
  department_id?: string;
  is_active?: boolean;
  has_skill?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateBuilderInput {
  name?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  is_active?: boolean;
  hourly_rate?: number;
  specialization?: string;
  availability_status?: string;
  bio?: string;
}

export interface AddSkillInput {
  builder_id: string;
  skill_name: string;
  proficiency_level?: number;
  assessed_date?: string;
}

export interface CreateAssignmentInput {
  phase_id: string;
  builder_id: string;
  role?: BuilderRole;
}

// ============================================
// QUERY HOOKS - BUILDERS
// ============================================

/**
 * Fetch all builders with optional filters
 */
export function useBuilders(filters?: BuilderFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.list(filters),
    queryFn: () => apiClient.get('/api/solutions/builders', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single builder by ID
 */
export function useBuilder(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/builders/${id}`),
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
    queryFn: () => apiClient.get('/api/solutions/builders/stats'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch available builders for a specific phase
 */
export function useAvailableBuildersForPhase(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.available(phaseId),
    queryFn: () => apiClient.get('/api/solutions/builders', { params: { available_for_phase: phaseId } }),
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
    queryFn: () => apiClient.get('/api/solutions/builders', { params: { pending_assignments: 'true' } }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch assignments by status
 */
export function useAssignmentsByStatus(status: AssignmentStatus) {
  return useQuery({
    queryKey: solutionsHubKeys.builderAssignments.byStatus(status),
    queryFn: () => apiClient.get('/api/solutions/builders', { params: { assignment_status: status } }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Check if assignment needs approval based on value thresholds
 */
export function useCheckAssignmentApproval(phaseId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.builderAssignments.approvalCheck(phaseId),
    queryFn: () => apiClient.get('/api/solutions/builders/assignments/approval-check', { params: { phase_id: phaseId } }),
    enabled: !!phaseId,
    staleTime: 0,
  });
}

/**
 * Search learners and staff who are not yet builders
 */
export function useSearchPeople(search: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.builders.all, 'search-people', search],
    queryFn: () => apiClient.get('/api/solutions/builders', { params: { search } }),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
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
    mutationFn: (input: CreateBuilderInput) => apiClient.post('/api/solutions/builders', input),
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
      apiClient.patch<{ id?: string } | null>(`/api/solutions/builders/${id}`, input),
    onSuccess: (data: { id?: string } | null) => {
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
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/builders/${id}`),
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
    mutationFn: (input: AddSkillInput) =>
      apiClient.post<{ builder_id?: string } | null>(`/api/solutions/builders/${input.builder_id}/skills`, input),
    onSuccess: (data: { builder_id?: string } | null) => {
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
    }) => apiClient.patch(`/api/solutions/builders/skills/${id}`, input),
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
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/builders/skills/${id}`),
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
    mutationFn: (input: CreateAssignmentInput) =>
      apiClient.post<{ phase_id?: string; builder_id?: string } | null>('/api/solutions/builders/assignments', input),
    onSuccess: (data: { phase_id?: string; builder_id?: string } | null) => {
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
      apiClient.patch(`/api/solutions/builders/assignments/${id}`, { _action: 'approve', approved_by: approverId }),
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
    mutationFn: (id: string) =>
      apiClient.patch(`/api/solutions/builders/assignments/${id}`, { _action: 'start' }),
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
    mutationFn: (id: string) =>
      apiClient.patch(`/api/solutions/builders/assignments/${id}`, { _action: 'complete' }),
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
    mutationFn: (id: string) =>
      apiClient.patch(`/api/solutions/builders/assignments/${id}`, { _action: 'withdraw' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builderAssignments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.builders.all });
    },
  });
}
