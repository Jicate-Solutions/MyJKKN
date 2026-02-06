'use client';

/**
 * Solutions Hub - Solutions Hooks
 * Purpose: React Query hooks for solutions CRUD operations
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-solutions.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { solutionsService } from '@/lib/services/solutions/solutions-service';
import type {
  SolutionFilters as ServiceSolutionFilters,
  UpdateSolutionInput as ServiceUpdateSolutionInput,
} from '@/lib/services/solutions/solutions-service';
import type { CreateSolutionInput as ServiceCreateSolutionInput } from '@/lib/services/solutions/types';

// ============================================
// TYPES (Re-export for backward compatibility)
// ============================================

export type SolutionFilters = ServiceSolutionFilters;

export interface CreateSolutionInput {
  solution_type: 'software' | 'training' | 'content';
  title: string;
  description?: string;
  client_id: string;
  lead_department_id: string;
  base_price?: number;
  discount_percentage?: number;
  final_price?: number;
  start_date?: string;
  target_date?: string;
  notes?: string;
  created_by: string;
}

export interface UpdateSolutionInput {
  title?: string;
  description?: string;
  status?: string;
  lead_department_id?: string;
  base_price?: number;
  discount_percentage?: number;
  final_price?: number;
  start_date?: string;
  target_date?: string;
  completion_date?: string;
  notes?: string;
}

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all solutions with optional filters
 */
export function useSolutions(filters?: SolutionFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.list(filters),
    queryFn: () => solutionsService.getSolutions(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single solution by ID
 */
export function useSolution(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.detail(id),
    queryFn: () => solutionsService.getSolutionById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch solution statistics (dashboard data)
 */
export function useSolutionStats() {
  return useQuery({
    queryKey: solutionsHubKeys.solutions.stats(),
    queryFn: () => solutionsService.getSolutionStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new solution
 */
export function useCreateSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSolutionInput) => {
      const result = await solutionsService.createSolution(input);
      return result as { id: string } & Record<string, unknown>;
    },
    onSuccess: () => {
      // Invalidate solutions list and stats
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.solutions.all });
    },
  });
}

/**
 * Update an existing solution
 */
export function useUpdateSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSolutionInput }) =>
      solutionsService.updateSolution(id, input),
    onSuccess: (data: { id?: string } | null) => {
      // Invalidate solutions list and update cache for specific solution
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.solutions.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.solutions.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a solution
 */
export function useDeleteSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => solutionsService.deleteSolution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.solutions.all });
    },
  });
}
