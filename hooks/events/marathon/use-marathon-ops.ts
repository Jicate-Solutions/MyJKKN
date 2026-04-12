// hooks/events/marathon/use-marathon-ops.ts
// React Query hooks for marathon event-day operations (scan, stats, search).
// Created: 2026-04-11
// Updated: 2026-04-12 - Added Supabase Realtime for live dashboard updates

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonOpsService,
} from '@/lib/services/events/marathon/marathon-ops-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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
 * Live ops stats with Supabase Realtime + 30s fallback polling.
 * Subscribes to Postgres changes on events_registrations for the given event.
 * Returns `isRealtime` to indicate if the Realtime channel is connected.
 */
export function useOpsStats(eventId: string) {
  const queryClient = useQueryClient();
  const [isRealtime, setIsRealtime] = useState(false);

  const query = useQuery({
    queryKey: KEYS.stats(eventId),
    queryFn: () => MarathonOpsService.getOpsStats(eventId),
    enabled: !!eventId,
    refetchInterval: 30_000, // Fallback polling — 30s instead of 10s since realtime handles most updates
  });

  useEffect(() => {
    if (!eventId) return;

    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel(`ops-dashboard-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events_registrations',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Invalidate stats so React Query refetches
          queryClient.invalidateQueries({ queryKey: KEYS.stats(eventId) });
        }
      )
      .subscribe((status) => {
        setIsRealtime(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsRealtime(false);
    };
  }, [eventId, queryClient]);

  return { ...query, isRealtime };
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
