'use client';

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type {
  NPSResponse,
  ResponseFilters,
  SubmitResponseDto
} from '@/types/stakeholder-nps';
import { npsSurveyKeys } from './use-nps-surveys';

// Query keys for cache management
export const npsResponseKeys = {
  all: ['nps-responses'] as const,
  lists: () => [...npsResponseKeys.all, 'list'] as const,
  list: (filters: ResponseFilters) => [...npsResponseKeys.lists(), filters] as const,
  details: () => [...npsResponseKeys.all, 'detail'] as const,
  detail: (id: string) => [...npsResponseKeys.details(), id] as const,
  summary: (surveyId: string) => [...npsResponseKeys.all, 'summary', surveyId] as const
};

/**
 * Hook for managing responses list with filters and pagination
 * FIXED: Added placeholderData for better UX during filter changes
 */
export function useNPSResponses(initialFilters: ResponseFilters) {
  const [filters, setFilters] = useState<ResponseFilters>(initialFilters);

  const query = useQuery({
    queryKey: npsResponseKeys.list(filters),
    queryFn: () => NPSService.getResponses(filters),
    enabled: !!filters.survey_id || !!initialFilters?.survey_id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<ResponseFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    responses: query.data?.data || [],
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
 * Hook for fetching a single response
 */
export function useNPSResponse(id: string) {
  const query = useQuery({
    queryKey: npsResponseKeys.detail(id),
    queryFn: () => NPSService.getResponse(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000
  });

  return {
    response: query.data,
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch
  };
}

/**
 * Hook for getting survey response summary
 */
export function useSurveyResponseSummary(surveyId: string) {
  const query = useQuery({
    queryKey: npsResponseKeys.summary(surveyId),
    queryFn: () => NPSService.getSurveyResponseSummary(surveyId),
    enabled: !!surveyId,
    staleTime: 1 * 60 * 1000 // 1 minute for summaries
  });

  return {
    summary: query.data || {
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      nps_score: 0,
      average_score: 0
    },
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch
  };
}

/**
 * Hook for submitting a survey response
 */
export function useSubmitNPSResponse() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: SubmitResponseDto) => NPSService.submitResponse(data),
    onSuccess: (_, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: npsResponseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsResponseKeys.summary(variables.survey_id) });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(variables.survey_id) });
      toast.success('Thank you for your feedback!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit response');
    }
  });

  return {
    submitResponse: mutation.mutateAsync,
    submit: mutation.mutate, // For use with onSuccess callbacks
    loading: mutation.isPending,
    error: mutation.error?.message || null,
    isSuccess: mutation.isSuccess
  };
}

/**
 * Hook for exporting survey responses
 * FIXED: Better error handling and cleanup
 */
export function useExportResponses() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportResponses = useCallback(async (surveyId: string, surveyTitle?: string) => {
    let url: string | null = null;
    try {
      setLoading(true);
      setError(null);
      const csv = await NPSService.exportResponses(surveyId);

      // Create blob and download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nps-responses-${surveyTitle || surveyId}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Responses exported successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export responses';
      setError(message);
      toast.error(message);
      throw err; // Re-throw for caller to handle if needed
    } finally {
      // Cleanup blob URL to prevent memory leak
      if (url) {
        URL.revokeObjectURL(url);
      }
      setLoading(false);
    }
  }, []);

  return {
    exportResponses,
    loading,
    error
  };
}
