// hooks/okr/use-check-ins.ts
// React Query hooks for OKR Check-ins

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import {
  OKRCheckIn,
  OKRListResponse,
  OKRCheckInFilters,
  CreateOKRCheckInDTO,
  OKRKRUpdate,
  OKRKRUpdateHistory
} from '@/types/okr';
import { OKRCheckInService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { keyResultKeys } from './use-key-results';

// Query key factory for check-ins
export const checkInKeys = {
  all: ['okr-check-ins'] as const,
  lists: () => [...checkInKeys.all, 'list'] as const,
  list: (filters: OKRCheckInFilters) => [...checkInKeys.lists(), filters] as const,
  current: () => [...checkInKeys.all, 'current'] as const,
  overdue: (userId?: string) => [...checkInKeys.all, 'overdue', userId] as const,
  history: () => [...checkInKeys.all, 'history'] as const,
  updates: (checkInId: string) =>
    [...checkInKeys.all, 'updates', checkInId] as const,
  byKeyResult: (keyResultId: string) =>
    [...checkInKeys.all, 'key-result', keyResultId] as const
};

/**
 * Get check-ins with filters
 */
export function useCheckIns(
  filters: OKRCheckInFilters = {}
): UseQueryResult<OKRListResponse<OKRCheckIn>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.list(filters),
    queryFn: () => OKRCheckInService.getCheckIns(filters),
    enabled: !authLoading && !!profile,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get current user's pending check-in for this week
 */
export function useCurrentCheckIn(): UseQueryResult<OKRCheckIn | null, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.current(),
    queryFn: () => OKRCheckInService.getCurrentCheckIn(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.REALTIME_DATA // Always fresh for current check-in
  });
}

/**
 * Get or create current week's check-in
 */
export function useGetOrCreateCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => OKRCheckInService.getOrCreateCurrentCheckIn(),
    onSuccess: (data) => {
      queryClient.setQueryData(checkInKeys.current(), data);
    }
  });
}

/**
 * Submit check-in mutation
 */
export function useSubmitCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateOKRCheckInDTO) =>
      OKRCheckInService.submitCheckIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checkInKeys.current() });
      queryClient.invalidateQueries({ queryKey: checkInKeys.lists() });
      queryClient.invalidateQueries({ queryKey: checkInKeys.history() });
      queryClient.invalidateQueries({ queryKey: ['okr-compliance'] });
      queryClient.invalidateQueries({ queryKey: keyResultKeys.all });
    }
  });
}

/**
 * Get overdue check-ins
 */
export function useOverdueCheckIns(
  userId?: string
): UseQueryResult<OKRCheckIn[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.overdue(userId),
    queryFn: () => OKRCheckInService.getOverdueCheckIns(userId),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Get check-in history for current user
 */
export function useMyCheckInHistory(
  limit = 10
): UseQueryResult<OKRListResponse<OKRCheckIn>, Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.history(),
    queryFn: () => OKRCheckInService.getMyCheckInHistory(limit),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  });
}

/**
 * Resolve blocker mutation
 */
export function useResolveBlocker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (checkInId: string) =>
      OKRCheckInService.resolveBlocker(checkInId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checkInKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['okr-team'] });
    }
  });
}

/**
 * Get KR updates for a specific check-in
 */
export function useCheckInUpdates(
  checkInId: string
): UseQueryResult<OKRKRUpdate[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.updates(checkInId),
    queryFn: () => OKRCheckInService.getCheckInUpdates(checkInId),
    enabled: !authLoading && !!profile && !!checkInId,
    ...QUERY_CONFIG.STABLE_DATA
  });
}

/**
 * Helper hook to get current week info
 */
export function useCurrentWeek() {
  return OKRCheckInService.getCurrentWeek();
}

/**
 * Get check-ins/updates for a specific key result
 */
export function useCheckInsByKeyResult(
  keyResultId: string
): UseQueryResult<OKRKRUpdateHistory[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: checkInKeys.byKeyResult(keyResultId),
    queryFn: async () => {
      // Get KR updates for this key result
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('okr_kr_updates')
        .select(`
          id,
          new_value,
          previous_value,
          source,
          exception_note,
          created_at,
          check_in:okr_check_ins(id, check_in_date, overall_notes)
        `)
        .eq('key_result_id', keyResultId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform to match expected format
      return (data || []).map((update: any) => ({
        id: update.id,
        check_in_date: update.created_at,
        check_in_value: update.new_value,
        notes: update.exception_note || update.check_in?.overall_notes,
        previous_value: update.previous_value,
        source: update.source
      }));
    },
    enabled: !authLoading && !!profile && !!keyResultId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Create a direct check-in/update for a key result
 */
export function useCreateCheckIn(keyResultId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { key_result_id: string; check_in_value: number; notes?: string }) => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();

      // Get current value of KR
      const { data: krData } = await (supabase as any)
        .from('okr_key_results')
        .select('current_value')
        .eq('id', data.key_result_id)
        .single();

      // Insert update record
      const { data: updateData, error: updateError } = await (supabase as any)
        .from('okr_kr_updates')
        .insert([{
          key_result_id: data.key_result_id,
          previous_value: krData?.current_value || 0,
          new_value: data.check_in_value,
          source: 'manual',
          exception_note: data.notes,
          auto_calculated: false
        }])
        .select()
        .single();

      if (updateError) throw updateError;

      // Update KR current value
      const { error: krError } = await (supabase as any)
        .from('okr_key_results')
        .update({
          current_value: data.check_in_value,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.key_result_id);

      if (krError) throw krError;

      return updateData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: checkInKeys.byKeyResult(keyResultId) });
      queryClient.invalidateQueries({ queryKey: keyResultKeys.all });
      queryClient.invalidateQueries({ queryKey: ['okr-objectives'] });
    }
  });
}
