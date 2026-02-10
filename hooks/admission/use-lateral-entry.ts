// hooks/admission/use-lateral-entry.ts
// React Query hooks for lateral entry and branch transfer management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LateralEntryService,
  type LateralEntryFilters,
  type CreateLateralEntryInput,
} from '@/lib/services/admission/lateral-entry-service';

export const lateralEntryKeys = {
  all: ['lateral-entry'] as const,
  lists: () => [...lateralEntryKeys.all, 'list'] as const,
  list: (filters: LateralEntryFilters) => [...lateralEntryKeys.lists(), filters] as const,
  documents: (appId: string) => [...lateralEntryKeys.all, 'documents', appId] as const,
  rules: (institutionId: string) => [...lateralEntryKeys.all, 'rules', institutionId] as const,
  vacancies: (institutionId: string) => [...lateralEntryKeys.all, 'vacancies', institutionId] as const,
  stats: (institutionId: string) => [...lateralEntryKeys.all, 'stats', institutionId] as const,
};

export function useLateralEntryApplications(filters: LateralEntryFilters) {
  const query = useQuery({
    queryKey: lateralEntryKeys.list(filters),
    queryFn: () => LateralEntryService.getApplications(filters),
    enabled: !!filters.institutionId,
  });

  return {
    applications: query.data?.data || [],
    metadata: query.data?.metadata,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useLateralEntryDocuments(applicationId: string) {
  const query = useQuery({
    queryKey: lateralEntryKeys.documents(applicationId),
    queryFn: () => LateralEntryService.getDocuments(applicationId),
    enabled: !!applicationId,
  });

  return {
    documents: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useEligibilityRules(institutionId: string) {
  const query = useQuery({
    queryKey: lateralEntryKeys.rules(institutionId),
    queryFn: () => LateralEntryService.getEligibilityRules(institutionId),
    enabled: !!institutionId,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useLateralEntryVacancies(institutionId: string) {
  const query = useQuery({
    queryKey: lateralEntryKeys.vacancies(institutionId),
    queryFn: () => LateralEntryService.getVacancies(institutionId),
    enabled: !!institutionId,
  });

  return {
    vacancies: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useLateralEntryStats(institutionId: string) {
  const query = useQuery({
    queryKey: lateralEntryKeys.stats(institutionId),
    queryFn: () => LateralEntryService.getStats(institutionId),
    enabled: !!institutionId,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCreateLateralEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLateralEntryInput) => LateralEntryService.createApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lateralEntryKeys.all });
      toast.success('Application submitted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit application: ${error.message}`);
    },
  });
}

export function useUpdateLateralEntryStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      LateralEntryService.updateApplicationStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lateralEntryKeys.all });
      toast.success('Application status updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });
}
