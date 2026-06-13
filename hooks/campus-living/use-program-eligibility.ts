import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProgramEligibilityService } from '@/lib/services/campus-living/program-eligibility-service';
import type {
  CreateProgramEligibilityDto,
  UpdateProgramEligibilityDto,
} from '@/types/program-eligibility';

// Shared React Query cache key. Every component that reads eligibility for a
// given institution subscribes to the SAME entry, so a mutation in the form
// dialog / row actions invalidates the key and the data-table refetches —
// no page reload needed (same rationale as use-amenities-categories).
const ELIG_KEY = ['campus-living', 'program-eligibility'] as const;

// ─── Combined eligibility (single table: room + mess per band) ──────────────
export function useEligibility(institutionId: string | null) {
  const queryClient = useQueryClient();

  // institutionId === null => list across ALL institutions (page-level view).
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'list', institutionId ?? 'all'],
    queryFn: () =>
      ProgramEligibilityService.getEligibility(institutionId ?? undefined),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...ELIG_KEY, 'list'] }),
    [queryClient]
  );

  const createEligibility = useCallback(
    async (dto: CreateProgramEligibilityDto) => {
      const result = await ProgramEligibilityService.createEligibility(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateEligibility = useCallback(
    async (id: string, dto: UpdateProgramEligibilityDto) => {
      const result = await ProgramEligibilityService.updateEligibility(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteEligibility = useCallback(
    async (id: string) => {
      await ProgramEligibilityService.deleteEligibility(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createEligibility,
    updateEligibility,
    deleteEligibility,
  };
}

// ─── Dry-run preview of the category sync (per-learner conditions) ──────────
// enabled gates the fetch to while the preview dialog is open; no staleTime so
// re-opening the dialog always re-evaluates against current rules/bills.
export function useCategorySyncPreview(enabled: boolean, institutionId?: string | null) {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'sync-preview', institutionId ?? 'all'],
    queryFn: () =>
      ProgramEligibilityService.previewLearnerCategorySync(institutionId ?? undefined),
    enabled,
    staleTime: 0,
  });
  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}

// ─── Write-back: apply fee-condition categories to learner profiles ─────────
// Pass an institutionId to scope the sync, or null/undefined for every
// institution. Invalidates eligibility + hostel resident caches so any open
// table reflects the new categories without a reload.
export function useSyncLearnerCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (institutionId?: string | null) =>
      ProgramEligibilityService.syncLearnerCategories(institutionId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ELIG_KEY] });
      queryClient.invalidateQueries({ queryKey: ['campus-living', 'residents'] });
      queryClient.invalidateQueries({ queryKey: ['campus-living', 'hostelites'] });
    },
  });
}

// ─── Dropdown option loaders ───────────────────────────────────────────────
export function useEligibilityInstitutions() {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'institutions'],
    queryFn: () => ProgramEligibilityService.getInstitutions(),
  });
  return { institutions: query.data ?? [], loading: query.isLoading };
}

export function useProgramsForInstitution(institutionId: string | null) {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'programs', institutionId],
    queryFn: () =>
      ProgramEligibilityService.getProgramsForInstitution(institutionId!),
    enabled: !!institutionId,
  });
  return { programs: query.data ?? [], loading: query.isLoading };
}

export function useActiveRoomCategories() {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'room-categories'],
    queryFn: () => ProgramEligibilityService.getActiveRoomCategories(),
  });
  return { categories: query.data ?? [], loading: query.isLoading };
}

export function useActiveMessCategories() {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'mess-categories'],
    queryFn: () => ProgramEligibilityService.getActiveMessCategories(),
  });
  return { categories: query.data ?? [], loading: query.isLoading };
}

export function useActiveQuotas() {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'quotas'],
    queryFn: () => ProgramEligibilityService.getActiveQuotas(),
  });
  return { quotas: query.data ?? [], loading: query.isLoading };
}
