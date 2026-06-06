import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProgramEligibilityService } from '@/lib/services/campus-living/program-eligibility-service';
import type {
  CreateProgramRoomEligibilityDto,
  UpdateProgramRoomEligibilityDto,
  CreateProgramMessEligibilityDto,
  UpdateProgramMessEligibilityDto,
} from '@/types/program-eligibility';

// Shared React Query cache key. Every component that reads eligibility for a
// given institution subscribes to the SAME entry, so a mutation in the form
// dialog / row actions invalidates the key and the data-table refetches —
// no page reload needed (same rationale as use-amenities-categories).
const ELIG_KEY = ['campus-living', 'program-eligibility'] as const;

// ─── Room eligibility ────────────────────────────────────────────────────
export function useRoomEligibility(institutionId: string | null) {
  const queryClient = useQueryClient();

  // institutionId === null => list across ALL institutions (page-level view).
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'room', institutionId ?? 'all'],
    queryFn: () =>
      ProgramEligibilityService.getRoomEligibility(institutionId ?? undefined),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...ELIG_KEY, 'room'] }),
    [queryClient]
  );

  const createRoomEligibility = useCallback(
    async (dto: CreateProgramRoomEligibilityDto) => {
      const result = await ProgramEligibilityService.createRoomEligibility(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateRoomEligibility = useCallback(
    async (id: string, dto: UpdateProgramRoomEligibilityDto) => {
      const result = await ProgramEligibilityService.updateRoomEligibility(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteRoomEligibility = useCallback(
    async (id: string) => {
      await ProgramEligibilityService.deleteRoomEligibility(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createRoomEligibility,
    updateRoomEligibility,
    deleteRoomEligibility,
  };
}

// ─── Mess eligibility ──────────────────────────────────────────────────────
export function useMessEligibility(institutionId: string | null) {
  const queryClient = useQueryClient();

  // institutionId === null => list across ALL institutions (page-level view).
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'mess', institutionId ?? 'all'],
    queryFn: () =>
      ProgramEligibilityService.getMessEligibility(institutionId ?? undefined),
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...ELIG_KEY, 'mess'] }),
    [queryClient]
  );

  const createMessEligibility = useCallback(
    async (dto: CreateProgramMessEligibilityDto) => {
      const result = await ProgramEligibilityService.createMessEligibility(dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const updateMessEligibility = useCallback(
    async (id: string, dto: UpdateProgramMessEligibilityDto) => {
      const result = await ProgramEligibilityService.updateMessEligibility(id, dto);
      await invalidate();
      return result;
    },
    [invalidate]
  );

  const deleteMessEligibility = useCallback(
    async (id: string) => {
      await ProgramEligibilityService.deleteMessEligibility(id);
      await invalidate();
    },
    [invalidate]
  );

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    createMessEligibility,
    updateMessEligibility,
    deleteMessEligibility,
  };
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
