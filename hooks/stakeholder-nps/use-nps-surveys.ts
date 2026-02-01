'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type {
  NPSSurvey,
  SurveyFilters,
  CreateSurveyDto,
  UpdateSurveyDto,
  StakeholderType,
  SurveyStatus
} from '@/types/stakeholder-nps';

// Query keys for cache management
export const npsSurveyKeys = {
  all: ['nps-surveys'] as const,
  lists: () => [...npsSurveyKeys.all, 'list'] as const,
  list: (filters: SurveyFilters) => [...npsSurveyKeys.lists(), filters] as const,
  details: () => [...npsSurveyKeys.all, 'detail'] as const,
  detail: (id: string) => [...npsSurveyKeys.details(), id] as const,
  active: (institutionId: string, stakeholderType: StakeholderType) =>
    [...npsSurveyKeys.all, 'active', institutionId, stakeholderType] as const
};

/**
 * Hook for managing surveys list with filters and pagination
 * FIXED: Added placeholderData for better UX during filter changes
 */
export function useNPSSurveys(initialFilters: SurveyFilters = {}) {
  const [filters, setFilters] = useState<SurveyFilters>(initialFilters);

  const query = useQuery({
    queryKey: npsSurveyKeys.list(filters),
    queryFn: () => NPSService.getSurveys(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<SurveyFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    surveys: query.data?.data || [],
    metadata: query.data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 0 },
    loading: query.isLoading,
    error: query.error?.message || null,
    filters,
    updateFilters,
    changePage,
    resetFilters,
    refetch: query.refetch
  };
}

/**
 * Hook for fetching a single survey
 */
export function useNPSSurvey(id: string) {
  const query = useQuery({
    queryKey: npsSurveyKeys.detail(id),
    queryFn: () => NPSService.getSurvey(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });

  return {
    survey: query.data,
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch
  };
}

/**
 * Hook for fetching active surveys for response submission
 */
export function useActiveSurveys(institutionId: string, stakeholderType: StakeholderType) {
  const query = useQuery({
    queryKey: npsSurveyKeys.active(institutionId, stakeholderType),
    queryFn: () => NPSService.getActiveSurveys(institutionId, stakeholderType),
    enabled: !!institutionId && !!stakeholderType,
    staleTime: 1 * 60 * 1000 // 1 minute for active surveys
  });

  return {
    surveys: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch
  };
}

/**
 * Hook for creating a survey
 */
export function useCreateNPSSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateSurveyDto) => NPSService.createSurvey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      toast.success('Survey created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create survey');
    }
  });

  return {
    createSurvey: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error?.message || null
  };
}

/**
 * Hook for updating a survey
 */
export function useUpdateNPSSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSurveyDto }) =>
      NPSService.updateSurvey(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(variables.id) });
      toast.success('Survey updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update survey');
    }
  });

  return {
    updateSurvey: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error?.message || null
  };
}

/**
 * Hook for activating a survey
 */
export function useActivateSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => NPSService.activateSurvey(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(id) });
      toast.success('Survey activated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to activate survey');
    }
  });

  return {
    activateSurvey: mutation.mutateAsync,
    loading: mutation.isPending
  };
}

/**
 * Hook for closing a survey
 */
export function useCloseSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => NPSService.closeSurvey(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(id) });
      toast.success('Survey closed successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to close survey');
    }
  });

  return {
    closeSurvey: mutation.mutateAsync,
    loading: mutation.isPending
  };
}

/**
 * Hook for archiving a survey
 */
export function useArchiveSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => NPSService.archiveSurvey(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(id) });
      toast.success('Survey archived successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive survey');
    }
  });

  return {
    archiveSurvey: mutation.mutateAsync,
    loading: mutation.isPending
  };
}

/**
 * Hook for deleting a survey
 */
export function useDeleteNPSSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => NPSService.deleteSurvey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      toast.success('Survey deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete survey');
    }
  });

  return {
    deleteSurvey: mutation.mutateAsync,
    loading: mutation.isPending
  };
}
