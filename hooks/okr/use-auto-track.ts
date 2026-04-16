// hooks/okr/use-auto-track.ts
// React Query hooks for OKR Auto-Tracking

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { OKRAutoTrackSource, OKRAvailableKPI } from '@/types/okr';
import { OKRAutoTrackService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { keyResultKeys } from './use-key-results';

// Query key factory for auto-track
export const autoTrackKeys = {
  all: ['okr-auto-track'] as const,
  sources: () => [...autoTrackKeys.all, 'sources'] as const,
  kpis: () => [...autoTrackKeys.all, 'kpis'] as const,
  syncStatus: (keyResultId: string) =>
    [...autoTrackKeys.all, 'sync-status', keyResultId] as const
};

/**
 * Get available auto-track sources
 */
export function useAutoTrackSources(): UseQueryResult<OKRAutoTrackSource[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: autoTrackKeys.sources(),
    queryFn: () => OKRAutoTrackService.getAvailableSources(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.STABLE_DATA // Sources rarely change
  });
}

/**
 * Get available KPIs for linking to Key Results
 */
export function useAvailableKPIs(): UseQueryResult<OKRAvailableKPI[], Error> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: autoTrackKeys.kpis(),
    queryFn: () => OKRAutoTrackService.getAvailableKPIs(),
    enabled: !authLoading && !!profile,
    ...QUERY_CONFIG.FORM_DATA // Used in forms for KR creation
  });
}

/**
 * Sync a single auto-tracked Key Result
 */
export function useSyncKeyResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyResultId: string) =>
      OKRAutoTrackService.syncKeyResult(keyResultId),
    onSuccess: (newValue, keyResultId) => {
      queryClient.invalidateQueries({
        queryKey: keyResultKeys.detail(keyResultId)
      });
      queryClient.invalidateQueries({
        queryKey: autoTrackKeys.syncStatus(keyResultId)
      });
    }
  });
}

/**
 * Sync all auto-tracked Key Results
 */
export function useSyncAllAutoTracked() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => OKRAutoTrackService.syncAllAutoTracked(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keyResultKeys.all });
      queryClient.invalidateQueries({ queryKey: ['okr-objectives'] });
    }
  });
}

/**
 * Get sync status for a Key Result
 */
export function useSyncStatus(keyResultId: string): UseQueryResult<
  {
    lastSynced: string | null;
    isStale: boolean;
    refreshFrequency: string;
  },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: autoTrackKeys.syncStatus(keyResultId),
    queryFn: () => OKRAutoTrackService.getSyncStatus(keyResultId),
    enabled: !authLoading && !!profile && !!keyResultId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}
