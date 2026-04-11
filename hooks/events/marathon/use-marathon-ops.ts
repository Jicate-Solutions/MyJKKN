// hooks/events/marathon/use-marathon-ops.ts
// React Query hooks for marathon event-day operations (scan, stats, search).
// Created: 2026-04-11

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonOpsService,
} from '@/lib/services/events/marathon/marathon-ops-service';
import type { OpsActionType, OpsScanResult } from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  stats: (eventId: string) => ['marathon-ops-stats', eventId] as const,
  search: (eventId: string, query: string) =>
    ['marathon-ops-search', eventId, query] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Live ops stats with 10-second auto-refresh for the dashboard.
 */
export function useOpsStats(eventId: string) {
  return useQuery({
    queryKey: KEYS.stats(eventId),
    queryFn: () => MarathonOpsService.getOpsStats(eventId),
    enabled: !!eventId,
    refetchInterval: 10_000,
  });
}

/**
 * Search registrations by BIB, name, or phone.
 * Enabled only when query is at least 2 characters.
 */
export function useOpsSearch(eventId: string, query: string) {
  return useQuery({
    queryKey: KEYS.search(eventId, query),
    queryFn: () => MarathonOpsService.searchRegistrations(eventId, query),
    enabled: !!eventId && query.length >= 2,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Process a scan action (check_in, tshirt, certificate).
 */
export function useProcessScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      bibNumber,
      action,
      operatorId,
    }: {
      eventId: string;
      bibNumber: string;
      action: OpsActionType;
      operatorId: string;
    }) => MarathonOpsService.processScan(eventId, bibNumber, action, operatorId),
    onSuccess: (result: OpsScanResult, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.stats(variables.eventId) });

      if (!result.success) {
        toast.error(result.message);
      } else if (result.already_done) {
        toast(result.message, { icon: '\u2139\uFE0F' });
      } else {
        toast.success(result.message);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Scan failed');
    },
  });
}
