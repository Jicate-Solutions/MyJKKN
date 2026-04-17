// hooks/okr/use-objectives.ts
// React Query hooks for OKR Objectives

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import {
  OKRObjective,
  OKRListResponse,
  OKRObjectiveFilters,
  CreateOKRObjectiveDTO,
  UpdateOKRObjectiveDTO,
  OKRCascadeNode
} from '@/types/okr';
import { OKRObjectiveService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// Query key factory for objectives
export const objectiveKeys = {
  all: ['okr-objectives'] as const,
  lists: () => [...objectiveKeys.all, 'list'] as const,
  list: (filters: OKRObjectiveFilters) =>
    [...objectiveKeys.lists(), filters] as const,
  details: () => [...objectiveKeys.all, 'detail'] as const,
  detail: (id: string) => [...objectiveKeys.details(), id] as const,
  cascade: () => [...objectiveKeys.all, 'cascade'] as const,
  cascadeRoot: (rootId?: string) => [...objectiveKeys.cascade(), rootId] as const,
  myObjectives: () => [...objectiveKeys.all, 'my'] as const,
  parents: (institutionId: string, level: string) =>
    [...objectiveKeys.all, 'parents', institutionId, level] as const
};

/**
 * Get objectives with filters and pagination
 */
export function useObjectives(
  filters: OKRObjectiveFilters
): UseQueryResult<OKRListResponse<OKRObjective>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  const queryKey = useMemo(() => {
    const stableFilters: OKRObjectiveFilters = {
      owner_id: filters.owner_id,
      institution_id: filters.institution_id,
      department_id: filters.department_id,
      tier: filters.tier,
      level: filters.level,
      status: filters.status,
      cycle_type: filters.cycle_type,
      page: filters.page || 1,
      limit: filters.limit || 10
    };
    return objectiveKeys.list(stableFilters);
  }, [
    filters.owner_id,
    filters.institution_id,
    filters.department_id,
    filters.tier,
    filters.level,
    filters.status,
    filters.cycle_type,
    filters.page,
    filters.limit
  ]);

  const queryFn = useCallback(async () => {
    try {
      return await OKRObjectiveService.getObjectives(filters);
    } catch (error) {
      console.error('[useObjectives] Fetch Error:', error);
      throw new Error('Failed to fetch objectives');
    }
  }, [filters]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get current user's objectives
 */
export function useMyObjectives(
  filters: Omit<OKRObjectiveFilters, 'owner_id'>
): UseQueryResult<OKRListResponse<OKRObjective>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: objectiveKeys.myObjectives(),
    queryFn: () => OKRObjectiveService.getMyObjectives(filters),
    enabled: !authLoading && !!profile,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get single objective by ID
 */
export function useObjective(id: string): UseQueryResult<OKRObjective, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: objectiveKeys.detail(id),
    queryFn: () => OKRObjectiveService.getObjectiveById(id),
    enabled: !authLoading && !!profile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get cascade tree
 */
export function useCascadeTree(
  rootObjectiveId?: string
): UseQueryResult<OKRCascadeNode[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: objectiveKeys.cascadeRoot(rootObjectiveId),
    queryFn: () => OKRObjectiveService.getCascadeTree(rootObjectiveId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Get available parent objectives for linking
 */
export function useAvailableParentObjectives(
  institutionId: string,
  level: 'department' | 'individual'
): UseQueryResult<OKRObjective[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: objectiveKeys.parents(institutionId, level),
    queryFn: () =>
      OKRObjectiveService.getAvailableParentObjectives(institutionId, level),
    enabled: !authLoading && !!profile && !!institutionId && !!level,
    ...QUERY_CONFIG.FORM_DATA
  });
}

/**
 * Create objective mutation
 */
export function useCreateObjective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRObjectiveDTO) =>
      OKRObjectiveService.createObjective(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: objectiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.myObjectives() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.cascade() });
    }
  });
}

/**
 * Update objective mutation
 */
export function useUpdateObjective(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOKRObjectiveDTO) =>
      OKRObjectiveService.updateObjective(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: objectiveKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.cascade() });
      queryClient.setQueryData(objectiveKeys.detail(id), data);
    }
  });
}

/**
 * Archive objective mutation
 */
export function useArchiveObjective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRObjectiveService.archiveObjective(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: objectiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.myObjectives() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.cascade() });
    }
  });
}

/**
 * Activate objective mutation
 */
export function useActivateObjective() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OKRObjectiveService.activateObjective(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: objectiveKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.lists() });
      queryClient.invalidateQueries({ queryKey: objectiveKeys.cascade() });
    }
  });
}
