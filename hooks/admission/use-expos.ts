// hooks/admission/use-expos.ts
// React Query hooks for Education Expo / Fair Events module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExpoService } from '@/lib/services/admission/expo-service';
import type {
  ExpoMasterFilters,
  CreateExpoMasterInput,
  UpdateExpoMasterInput,
  ExpoEventFilters,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  CreateExpoTeamMemberInput,
  CreateDailyReportInput,
  UpdateDailyReportInput,
} from '@/types/admission';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const expoKeys = {
  all: ['expos'] as const,
  masters: (filters: ExpoMasterFilters) => ['expo-masters', filters] as const,
  master: (id: string) => ['expo-master', id] as const,
  events: (filters: ExpoEventFilters) => ['expo-events', filters] as const,
  event: (id: string) => ['expo-event', id] as const,
  teamMembers: (eventId: string) => ['expo-team', eventId] as const,
  dailyReports: (eventId: string) => ['expo-reports', eventId] as const,
  dailyReport: (id: string) => ['expo-report', id] as const,
  summaryStats: (institutionId: string) => ['expo-stats', institutionId] as const,
  expenseBreakdown: (institutionId: string) => ['expo-expense-breakdown', institutionId] as const,
  leadFunnel: (institutionId: string) => ['expo-lead-funnel', institutionId] as const,
  comparison: (institutionId: string) => ['expo-comparison', institutionId] as const,
  dailyTrends: (eventId: string) => ['expo-daily-trends', eventId] as const,
};

// ============================================================================
// QUERY HOOKS — EXPO MASTERS
// ============================================================================

/**
 * Fetch paginated list of expo master records.
 */
export function useExpoMasters(filters: ExpoMasterFilters) {
  const query = useQuery({
    queryKey: expoKeys.masters(filters),
    queryFn: () => ExpoService.getExpoMasters(filters),
    enabled: !!filters.institution_id,
  });

  return {
    data: query.data?.data || [],
    metadata: query.data?.metadata,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single expo master by ID.
 */
export function useExpoMaster(id: string) {
  const query = useQuery({
    queryKey: expoKeys.master(id),
    queryFn: () => ExpoService.getExpoMaster(id),
    enabled: !!id,
  });

  return {
    master: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// QUERY HOOKS — EXPO EVENTS
// ============================================================================

/**
 * Fetch paginated list of expo events.
 */
export function useExpoEvents(filters: ExpoEventFilters) {
  const query = useQuery({
    queryKey: expoKeys.events(filters),
    queryFn: () => ExpoService.getExpoEvents(filters),
    enabled: !!filters.institution_id,
  });

  return {
    data: query.data?.data || [],
    metadata: query.data?.metadata,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single expo event with full detail joins.
 */
export function useExpoEvent(id: string) {
  const query = useQuery({
    queryKey: expoKeys.event(id),
    queryFn: () => ExpoService.getExpoEvent(id),
    enabled: !!id,
  });

  return {
    event: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// QUERY HOOKS — TEAM MEMBERS
// ============================================================================

/**
 * Fetch all team members for a given expo event.
 */
export function useExpoTeamMembers(eventId: string) {
  const query = useQuery({
    queryKey: expoKeys.teamMembers(eventId),
    queryFn: () => ExpoService.getTeamMembers(eventId),
    enabled: !!eventId,
  });

  return {
    teamMembers: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// QUERY HOOKS — DAILY REPORTS
// ============================================================================

/**
 * Fetch all daily reports for a given expo event.
 */
export function useExpoDailyReports(eventId: string) {
  const query = useQuery({
    queryKey: expoKeys.dailyReports(eventId),
    queryFn: () => ExpoService.getDailyReports(eventId),
    enabled: !!eventId,
  });

  return {
    reports: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch a single daily report by ID.
 */
export function useExpoDailyReport(id: string) {
  const query = useQuery({
    queryKey: expoKeys.dailyReport(id),
    queryFn: () => ExpoService.getDailyReport(id),
    enabled: !!id,
  });

  return {
    report: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// QUERY HOOKS — ANALYTICS
// ============================================================================

/**
 * Fetch high-level summary stats for all expos of an institution.
 */
export function useExpoSummaryStats(institutionId: string) {
  const query = useQuery({
    queryKey: expoKeys.summaryStats(institutionId),
    queryFn: () => ExpoService.getSummaryStats(institutionId),
    enabled: !!institutionId,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch expense breakdown by category for an institution.
 */
export function useExpoExpenseBreakdown(institutionId: string) {
  const query = useQuery({
    queryKey: expoKeys.expenseBreakdown(institutionId),
    queryFn: () => ExpoService.getExpenseBreakdown(institutionId),
    enabled: !!institutionId,
  });

  return {
    breakdown: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch visitor-to-lead funnel data for an institution.
 */
export function useExpoLeadFunnel(institutionId: string) {
  const query = useQuery({
    queryKey: expoKeys.leadFunnel(institutionId),
    queryFn: () => ExpoService.getLeadFunnel(institutionId),
    enabled: !!institutionId,
  });

  return {
    funnel: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch comparative expo performance data for an institution.
 */
export function useExpoComparison(institutionId: string) {
  const query = useQuery({
    queryKey: expoKeys.comparison(institutionId),
    queryFn: () => ExpoService.getExpoComparison(institutionId),
    enabled: !!institutionId,
  });

  return {
    comparison: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Fetch day-by-day trends for a single expo event.
 */
export function useExpoDailyTrends(eventId: string) {
  const query = useQuery({
    queryKey: expoKeys.dailyTrends(eventId),
    queryFn: () => ExpoService.getDailyTrends(eventId),
    enabled: !!eventId,
  });

  return {
    trends: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// MUTATION HOOKS — EXPO MASTERS
// ============================================================================

/**
 * Create a new expo master record.
 */
export function useCreateExpoMaster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpoMasterInput) => ExpoService.createExpoMaster(input),
    onSuccess: () => {
      toast.success('Expo master created');
      queryClient.invalidateQueries({ queryKey: ['expo-masters'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Update an existing expo master record.
 */
export function useUpdateExpoMaster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExpoMasterInput & { id: string }) =>
      ExpoService.updateExpoMaster(id, input),
    onSuccess: (data) => {
      toast.success('Expo master updated');
      queryClient.invalidateQueries({ queryKey: ['expo-masters'] });
      queryClient.invalidateQueries({ queryKey: expoKeys.master(data.id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Delete an expo master record.
 */
export function useDeleteExpoMaster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ExpoService.deleteExpoMaster(id),
    onSuccess: () => {
      toast.success('Expo master deleted');
      queryClient.invalidateQueries({ queryKey: ['expo-masters'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

// ============================================================================
// MUTATION HOOKS — EXPO EVENTS
// ============================================================================

/**
 * Create a new expo event (with optional team members).
 */
export function useCreateExpoEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpoEventInput) => ExpoService.createExpoEvent(input),
    onSuccess: (data) => {
      toast.success('Expo event created');
      queryClient.invalidateQueries({ queryKey: ['expo-events'] });
      queryClient.invalidateQueries({ queryKey: expoKeys.summaryStats(data.institution_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Update an existing expo event's fields.
 */
export function useUpdateExpoEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExpoEventInput & { id: string }) =>
      ExpoService.updateExpoEvent(id, input),
    onSuccess: (data) => {
      toast.success('Expo event updated');
      queryClient.invalidateQueries({ queryKey: ['expo-events'] });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(data.id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Transition an expo event's status.
 */
export function useUpdateExpoEventStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ExpoService.updateEventStatus(id, status),
    onSuccess: (data) => {
      toast.success('Event status updated');
      queryClient.invalidateQueries({ queryKey: ['expo-events'] });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(data.id) });
      queryClient.invalidateQueries({ queryKey: expoKeys.summaryStats(data.institution_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

// ============================================================================
// MUTATION HOOKS — TEAM MEMBERS
// ============================================================================

/**
 * Add a team member to an expo event.
 */
export function useAddExpoTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, ...input }: CreateExpoTeamMemberInput & { eventId: string }) =>
      ExpoService.addTeamMember(eventId, input),
    onSuccess: (_data, variables) => {
      toast.success('Team member added');
      queryClient.invalidateQueries({ queryKey: expoKeys.teamMembers(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(variables.eventId) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Remove a team member from an expo event.
 */
export function useRemoveExpoTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId }: { memberId: string; eventId: string }) =>
      ExpoService.removeTeamMember(memberId),
    onSuccess: (_data, variables) => {
      toast.success('Team member removed');
      queryClient.invalidateQueries({ queryKey: expoKeys.teamMembers(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(variables.eventId) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

// ============================================================================
// MUTATION HOOKS — DAILY REPORTS
// ============================================================================

/**
 * Create a new daily report for an expo event.
 */
export function useCreateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDailyReportInput) => ExpoService.createDailyReport(input),
    onSuccess: (data) => {
      toast.success('Daily report created');
      queryClient.invalidateQueries({ queryKey: expoKeys.dailyReports(data.expo_event_id) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(data.expo_event_id) });
      queryClient.invalidateQueries({ queryKey: expoKeys.summaryStats(data.institution_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Update an existing daily report.
 */
export function useUpdateDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId, ...input }: UpdateDailyReportInput & { id: string; eventId: string }) =>
      ExpoService.updateDailyReport(id, input),
    onSuccess: (data, variables) => {
      toast.success('Daily report updated');
      queryClient.invalidateQueries({ queryKey: expoKeys.dailyReports(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: expoKeys.dailyReport(data.id) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(variables.eventId) });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Delete a daily report.
 */
export function useDeleteDailyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; eventId: string }) =>
      ExpoService.deleteDailyReport(id),
    onSuccess: (_data, variables) => {
      toast.success('Daily report deleted');
      queryClient.invalidateQueries({ queryKey: expoKeys.dailyReports(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: expoKeys.event(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: ['expo-stats'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
