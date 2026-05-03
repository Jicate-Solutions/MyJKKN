// hooks/ims/use-ims-activity-log.ts
// Phase F (2026-04-28): React Query hook for entity-level audit history.
// Returns the chronological list of who-did-what for one indent / GRN / shipment / adjustment / sale.

'use client';

import { useQuery } from '@tanstack/react-query';
import { ImsActivityLogService } from '@/lib/services/ims/activity-log-service';
import type {
  ImsActivityEntityType,
  ImsActivityLogEntry,
} from '@/types/ims/activity-log';

export function useImsActivityLog(
  entityType: ImsActivityEntityType,
  entityId: string | null | undefined
) {
  return useQuery<ImsActivityLogEntry[]>({
    queryKey: ['ims-activity-log', entityType, entityId],
    queryFn: () => ImsActivityLogService.list(entityType, entityId as string),
    enabled: !!entityId,
    // Activity history is append-only — refetch on focus to pick up new transitions
    // (e.g., approver acted on it in a parallel tab).
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000, // 30s — short TTL since activity is the freshness signal users care about
  });
}
