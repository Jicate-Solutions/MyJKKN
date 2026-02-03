'use client';

/**
 * Solutions Hub - Phases Hooks
 * Purpose: React Query hooks for solution phases CRUD and related operations
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-phases.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type PhaseStatus =
  | 'prospecting'
  | 'discovery'
  | 'prd_writing'
  | 'prototype_building'
  | 'client_demo'
  | 'revisions'
  | 'approved'
  | 'deploying'
  | 'training'
  | 'live'
  | 'in_amc'
  | 'completed'
  | 'on_hold'
  | 'cancelled';

export interface PhaseFilters {
  solution_id?: string;
  status?: PhaseStatus;
  owner_department_id?: string;
  search?: string;
  page?: number;
  limit?: number;
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

export interface UpdatePhaseInput {
  title?: string;
  description?: string;
  status?: PhaseStatus;
  owner_department_id?: string;
  estimated_value?: number;
  start_date?: string;
  due_date?: string;
  completion_date?: string;
}

export interface CreateIterationInput {
  phase_id: string;
  version: number;
  prototype_url?: string;
  changes_made?: string;
}

export interface CreateBugReportInput {
  iteration_id: string;
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  reported_by: string;
}

export interface CreateDeploymentInput {
  phase_id: string;
  environment: 'development' | 'staging' | 'production';
  vercel_url?: string;
  supabase_project_id?: string;
  notes?: string;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PhaseService = any;

const phasesService: PhaseService = {
  getPhases: async (_filters?: PhaseFilters) => {
    throw new Error('phasesService.getPhases not implemented');
  },
  getPhaseById: async (_id: string) => {
    throw new Error('phasesService.getPhaseById not implemented');
  },
  getPhasesBySolution: async (_solutionId: string) => {
    throw new Error('phasesService.getPhasesBySolution not implemented');
  },
  createPhase: async (_input: CreatePhaseInput) => {
    throw new Error('phasesService.createPhase not implemented');
  },
  updatePhase: async (_id: string, _input: UpdatePhaseInput) => {
    throw new Error('phasesService.updatePhase not implemented');
  },
  deletePhase: async (_id: string) => {
    throw new Error('phasesService.deletePhase not implemented');
  },
  getNextPhaseNumber: async (_solutionId: string) => {
    throw new Error('phasesService.getNextPhaseNumber not implemented');
  },
  getPhaseStats: async () => {
    throw new Error('phasesService.getPhaseStats not implemented');
  },
  createIteration: async (_input: CreateIterationInput) => {
    throw new Error('phasesService.createIteration not implemented');
  },
  updateIteration: async (_id: string, _input: { feedback?: string; client_approved?: boolean }) => {
    throw new Error('phasesService.updateIteration not implemented');
  },
  createBugReport: async (_input: CreateBugReportInput) => {
    throw new Error('phasesService.createBugReport not implemented');
  },
  updateBugReport: async (_id: string, _input: { status?: string; resolved_by?: string; resolution_notes?: string }) => {
    throw new Error('phasesService.updateBugReport not implemented');
  },
  createDeployment: async (_input: CreateDeploymentInput) => {
    throw new Error('phasesService.createDeployment not implemented');
  },
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all phases with optional filters
 */
export function usePhases(filters?: PhaseFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.list(filters),
    queryFn: () => phasesService.getPhases(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single phase by ID
 */
export function usePhase(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.detail(id),
    queryFn: () => phasesService.getPhaseById(id),
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
    queryFn: () => phasesService.getPhasesBySolution(solutionId),
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
    queryFn: () => phasesService.getPhaseStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get the next phase number for a solution
 */
export function useNextPhaseNumber(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.phases.nextNumber(solutionId),
    queryFn: () => phasesService.getNextPhaseNumber(solutionId),
    enabled: !!solutionId,
    staleTime: 0, // Always fetch fresh
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
    mutationFn: (input: CreatePhaseInput) => phasesService.createPhase(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
      if (data?.solution_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.bySolution(data.solution_id),
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
      phasesService.updatePhase(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => phasesService.deletePhase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - ITERATIONS
// ============================================

/**
 * Create a prototype iteration
 */
export function useCreateIteration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateIterationInput) => phasesService.createIteration(input),
    onSuccess: (data) => {
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
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
    }) => phasesService.updateIteration(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - BUG REPORTS
// ============================================

/**
 * Create a bug report for an iteration
 */
export function useCreateBugReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBugReportInput) => phasesService.createBugReport(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
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
    }) => phasesService.updateBugReport(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.phases.all });
    },
  });
}

// ============================================
// MUTATION HOOKS - DEPLOYMENTS
// ============================================

/**
 * Create a deployment record
 */
export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeploymentInput) => phasesService.createDeployment(input),
    onSuccess: (data) => {
      if (data?.phase_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.phases.detail(data.phase_id),
        });
      }
    },
  });
}
