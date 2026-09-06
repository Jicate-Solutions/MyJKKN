// ============================================================================
// Premium Room Phase 2 — usePremiumAudit hooks (React Query wrappers)
// ============================================================================
// Service: lib/services/campus-living/hostel-premium-audit-service.ts
// ============================================================================

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  listPremiumAuditEvents,
  getAuditRow,
  listCurrentPremiumAllocations,
  overridePremiumAllocation,
  type ListCurrentPremiumAllocationsParams,
  type PremiumAllocationListResult,
} from '@/lib/services/campus-living/hostel-premium-audit-service';
import type {
  PremiumAuditFilters,
  PremiumAuditListResult,
  PremiumAuditLogRow,
  OverridePremiumAllocationInput,
  OverridePremiumAllocationResult,
} from '@/types/campus-living/premium-audit';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const premiumAuditKeys = {
  all: ['premium-audit'] as const,
  events: (filters: PremiumAuditFilters) =>
    ['premium-audit', 'events', filters] as const,
  event: (id: string) => ['premium-audit', 'event', id] as const,
  currentAllocations: (params: ListCurrentPremiumAllocationsParams) =>
    ['premium-audit', 'current-allocations', params] as const,
};

// ---------------------------------------------------------------------------
// Audit-log queries
// ---------------------------------------------------------------------------

export function usePremiumAuditEvents(filters: PremiumAuditFilters = {}) {
  return useQuery<PremiumAuditListResult, Error>({
    queryKey: premiumAuditKeys.events(filters),
    queryFn: () => listPremiumAuditEvents(filters),
    staleTime: 15_000,
  });
}

export function usePremiumAuditEvent(id: string | null | undefined) {
  return useQuery<PremiumAuditLogRow | null, Error>({
    queryKey: id ? premiumAuditKeys.event(id) : ['premium-audit', 'event', 'noop'],
    queryFn: () => (id ? getAuditRow(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Override page query
// ---------------------------------------------------------------------------

export function useCurrentPremiumAllocations(
  params: ListCurrentPremiumAllocationsParams = {},
) {
  return useQuery<PremiumAllocationListResult, Error>({
    queryKey: premiumAuditKeys.currentAllocations(params),
    queryFn: () => listCurrentPremiumAllocations(params),
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Override mutation
// ---------------------------------------------------------------------------

export function useOverridePremiumAllocation() {
  const qc = useQueryClient();
  return useMutation<OverridePremiumAllocationResult, Error, OverridePremiumAllocationInput>({
    mutationFn: (input) => overridePremiumAllocation(input),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Override applied. Audit trail recorded.');
        qc.invalidateQueries({ queryKey: premiumAuditKeys.all });
      } else {
        toast.error(result.error || 'Override rejected.');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Override failed.');
    },
  });
}
