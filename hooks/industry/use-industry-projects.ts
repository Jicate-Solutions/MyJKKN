// ============================================================================
// React Query hooks for Industry Projects
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import type {
  IndustryProject,
  IndustryListResponse,
  IndustryProjectFilters,
  CreateIndustryProjectDTO,
  UpdateIndustryProjectDTO,
  ProjectPickerOption,
  ProjectSummary,
  ProjectStatus
} from '@/types/industry';
import { IndustryProjectService } from '@/lib/services/industry';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory
export const projectKeys = {
  all: ['industry-projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filters: IndustryProjectFilters) => [...projectKeys.lists(), filters] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  byPartner: (partnerId: string) => [...projectKeys.all, 'by-partner', partnerId] as const,
  open: (filters?: Omit<IndustryProjectFilters, 'status'>) =>
    [...projectKeys.all, 'open', filters || {}] as const,
  options: (partnerId?: string) => [...projectKeys.all, 'options', partnerId || 'all'] as const,
  summaries: (partnerId?: string) => [...projectKeys.all, 'summaries', partnerId || 'all'] as const
};

/**
 * Get projects with filters and pagination
 */
export function useIndustryProjects(
  filters: IndustryProjectFilters = {}
): UseQueryResult<IndustryListResponse<IndustryProject>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: IndustryProjectFilters = {
      partner_id: filters.partner_id,
      status: filters.status,
      difficulty_level: filters.difficulty_level,
      required_competency: filters.required_competency,
      has_stipend: filters.has_stipend,
      search: filters.search,
      page: filters.page || 1,
      limit: filters.limit || 10,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order
    };
    return projectKeys.list(stableFilters);
  }, [
    filters.partner_id,
    filters.status,
    filters.difficulty_level,
    filters.required_competency,
    filters.has_stipend,
    filters.search,
    filters.page,
    filters.limit,
    filters.sort_by,
    filters.sort_order
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await IndustryProjectService.getProjects(filters);
    } catch (error) {
      console.error('[useIndustryProjects] Fetch error:', error);
      throw new Error('Failed to fetch industry projects');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single project by ID
 */
export function useIndustryProject(id: string): UseQueryResult<IndustryProject, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => IndustryProjectService.getProjectById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get projects by partner ID
 */
export function useProjectsByPartner(
  partnerId: string
): UseQueryResult<IndustryProject[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: projectKeys.byPartner(partnerId),
    queryFn: () => IndustryProjectService.getProjectsByPartnerId(partnerId),
    enabled: !authLoading && !!profile && !!partnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get open projects for learner browsing
 */
export function useOpenProjects(
  filters: Omit<IndustryProjectFilters, 'status'> = {}
): UseQueryResult<IndustryListResponse<IndustryProject>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: projectKeys.open(filters),
    queryFn: () => IndustryProjectService.getOpenProjects(filters),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get project options for picker
 */
export function useProjectOptions(
  partnerId?: string
): UseQueryResult<ProjectPickerOption[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: projectKeys.options(partnerId),
    queryFn: () => IndustryProjectService.getProjectOptions(partnerId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.FORM_DATA
  });
}

/**
 * Get project summaries for listings
 */
export function useProjectSummaries(
  partnerId?: string
): UseQueryResult<ProjectSummary[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: projectKeys.summaries(partnerId),
    queryFn: () => IndustryProjectService.getProjectSummaries(partnerId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Create project mutation
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateIndustryProjectDTO) =>
      IndustryProjectService.createProject(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      // Only invalidate partner-specific queries if partner_id exists
      if (data.partner_id) {
        queryClient.invalidateQueries({ queryKey: projectKeys.byPartner(data.partner_id) });
      }
      queryClient.invalidateQueries({ queryKey: projectKeys.options() });
      queryClient.invalidateQueries({ queryKey: projectKeys.summaries() });
    }
  });
}

/**
 * Update project mutation
 */
export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateIndustryProjectDTO) =>
      IndustryProjectService.updateProject(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.setQueryData(projectKeys.detail(id), data);
    }
  });
}

/**
 * Update project status mutation
 */
export function useUpdateProjectStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      IndustryProjectService.updateProjectStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.open() });
      queryClient.invalidateQueries({ queryKey: projectKeys.summaries() });
    }
  });
}

/**
 * Delete project mutation (only drafts)
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryProjectService.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.options() });
      queryClient.invalidateQueries({ queryKey: projectKeys.summaries() });
    }
  });
}

/**
 * Cancel project mutation
 */
export function useCancelProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => IndustryProjectService.cancelProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.open() });
      queryClient.invalidateQueries({ queryKey: projectKeys.summaries() });
    }
  });
}
