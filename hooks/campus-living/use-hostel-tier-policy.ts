// ============================================================================
// Premium Room Phase 1 — useHostelTierPolicy React Query hook
// ============================================================================
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
// Service: lib/services/campus-living/hostel-tier-service.ts
//
// React Query wrapper around hostel tier policy CRUD. Mirrors the existing
// use-hostel-allocations hook pattern (queryKey factory + suspense-safe
// fetcher + mutation hooks that invalidate caches).
// ============================================================================

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  listHostelTiers,
  getHostelTier,
  upsertHostelTier,
  deleteHostelTier,
  seedInstitutionTierDefaults,
} from '@/lib/services/campus-living/hostel-tier-service';
import type {
  HostelTierPolicy,
  UpsertHostelTierInput,
} from '@/types/campus-living/premium';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const hostelTierKeys = {
  all: ['hostel-tier-policy'] as const,
  list: (institutionId: string | null | undefined) =>
    ['hostel-tier-policy', 'list', institutionId ?? 'global'] as const,
  detail: (id: string) => ['hostel-tier-policy', 'detail', id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useHostelTiers(institutionId?: string | null) {
  return useQuery<HostelTierPolicy[], Error>({
    queryKey: hostelTierKeys.list(institutionId),
    queryFn: () => listHostelTiers(institutionId ?? null),
    staleTime: 60_000,
  });
}

export function useHostelTier(id: string | null | undefined) {
  return useQuery<HostelTierPolicy | null, Error>({
    queryKey: id ? hostelTierKeys.detail(id) : ['hostel-tier-policy', 'detail', 'noop'],
    queryFn: () => (id ? getHostelTier(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface UpsertHostelTierVariables {
  row: UpsertHostelTierInput;
  updatedBy: string;
}

export function useUpsertHostelTier() {
  const qc = useQueryClient();
  return useMutation<HostelTierPolicy, Error, UpsertHostelTierVariables>({
    mutationFn: ({ row, updatedBy }) => upsertHostelTier(row, updatedBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostelTierKeys.all });
      toast.success('Hostel tier policy saved');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to save hostel tier policy');
    },
  });
}

export function useDeleteHostelTier() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteHostelTier(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostelTierKeys.all });
      toast.success('Hostel tier policy removed');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to remove hostel tier policy');
    },
  });
}

interface SeedInstitutionDefaultsVariables {
  institutionId: string;
  createdBy: string;
}

export function useSeedInstitutionTierDefaults() {
  const qc = useQueryClient();
  return useMutation<HostelTierPolicy[], Error, SeedInstitutionDefaultsVariables>({
    mutationFn: ({ institutionId, createdBy }) =>
      seedInstitutionTierDefaults(institutionId, createdBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hostelTierKeys.all });
      toast.success('Institution tier defaults created');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to seed institution tier defaults');
    },
  });
}
