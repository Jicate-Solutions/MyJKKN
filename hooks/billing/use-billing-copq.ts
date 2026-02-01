// hooks/billing/use-billing-copq.ts
// React Query hooks for Billing COPQ operations

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { BillingCOPQService } from '@/lib/services/billing/copq/billing-copq-service';
import type {
  COPQFilters,
  CreateCOPQIncidentDto,
  UpdateCOPQIncidentDto
} from '@/types/billing-copq';

// Query keys for cache management
export const copqKeys = {
  all: ['billing-copq'] as const,
  incidents: (filters: COPQFilters) => [...copqKeys.all, 'incidents', filters] as const,
  incident: (id: string) => [...copqKeys.all, 'incident', id] as const,
  summary: (institutionId: string, year?: number) =>
    [...copqKeys.all, 'summary', institutionId, year] as const,
  dashboard: (institutionId: string, year?: number) =>
    [...copqKeys.all, 'dashboard', institutionId, year] as const,
  iceberg: (institutionId: string, year?: number) =>
    [...copqKeys.all, 'iceberg', institutionId, year] as const
};

/**
 * Hook for fetching COPQ incidents with filters and pagination
 */
export function useBillingCOPQIncidents(initialFilters: COPQFilters) {
  const [filters, setFilters] = useState<COPQFilters>({
    page: 1,
    limit: 10,
    ...initialFilters
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: copqKeys.incidents(filters),
    queryFn: () => BillingCOPQService.getIncidents(filters),
    placeholderData: (previousData) => previousData
  });

  const updateFilters = useCallback((newFilters: Partial<COPQFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page || 1
    }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: copqKeys.all });
  }, [queryClient]);

  return {
    incidents: data?.data || [],
    metadata: data?.metadata || {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    },
    loading: isLoading,
    error: error?.message,
    filters,
    updateFilters,
    changePage,
    refetch,
    invalidate
  };
}

/**
 * Hook for fetching a single COPQ incident
 */
export function useBillingCOPQIncident(id: string) {
  return useQuery({
    queryKey: copqKeys.incident(id),
    queryFn: () => BillingCOPQService.getIncident(id),
    enabled: !!id
  });
}

/**
 * Hook for creating a new COPQ incident
 */
export function useCreateCOPQIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCOPQIncidentDto) =>
      BillingCOPQService.logIncident(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copqKeys.all });
      toast.success('COPQ incident logged successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log COPQ incident');
    }
  });
}

/**
 * Hook for updating a COPQ incident
 */
export function useUpdateCOPQIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCOPQIncidentDto }) =>
      BillingCOPQService.updateIncident(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: copqKeys.all });
      queryClient.invalidateQueries({ queryKey: copqKeys.incident(variables.id) });
      toast.success('COPQ incident updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update COPQ incident');
    }
  });
}

/**
 * Hook for deleting a COPQ incident
 */
export function useDeleteCOPQIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingCOPQService.deleteIncident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: copqKeys.all });
      toast.success('COPQ incident deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete COPQ incident');
    }
  });
}

/**
 * Hook for resolving a COPQ incident
 */
export function useResolveCOPQIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      preventiveAction
    }: {
      id: string;
      preventiveAction?: string;
    }) => BillingCOPQService.resolveIncident(id, preventiveAction),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: copqKeys.all });
      queryClient.invalidateQueries({ queryKey: copqKeys.incident(variables.id) });
      toast.success('COPQ incident resolved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve COPQ incident');
    }
  });
}

/**
 * Hook for writing off a COPQ incident
 */
export function useWriteOffCOPQIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => BillingCOPQService.writeOffIncident(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: copqKeys.all });
      queryClient.invalidateQueries({ queryKey: copqKeys.incident(id) });
      toast.success('COPQ incident written off successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to write off COPQ incident');
    }
  });
}

/**
 * Hook for fetching COPQ summary statistics
 */
export function useCOPQSummary(institutionId: string, year?: number) {
  return useQuery({
    queryKey: copqKeys.summary(institutionId, year),
    queryFn: () => BillingCOPQService.getSummary(institutionId, year),
    enabled: !!institutionId
  });
}

/**
 * Hook for fetching COPQ dashboard data
 */
export function useCOPQDashboard(institutionId: string, year?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: copqKeys.dashboard(institutionId, year),
    queryFn: async () => {
      try {
        return await BillingCOPQService.getDashboard(institutionId, year);
      } catch (err) {
        console.error('[useCOPQDashboard] Error:', err);
        throw err;
      }
    },
    enabled: !!institutionId,
    retry: false
  });

  return {
    dashboard: data || null,
    loading: isLoading,
    error: error?.message,
    refetch
  };
}

/**
 * Hook for fetching COPQ iceberg visualization data
 */
export function useCOPQIceberg(institutionId: string, year?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: copqKeys.iceberg(institutionId, year),
    queryFn: async () => {
      try {
        return await BillingCOPQService.getIcebergData(institutionId, year);
      } catch (err) {
        console.error('[useCOPQIceberg] Error:', err);
        throw err;
      }
    },
    enabled: !!institutionId,
    retry: false
  });

  return {
    iceberg: data || null,
    loading: isLoading,
    error: error?.message,
    refetch
  };
}
