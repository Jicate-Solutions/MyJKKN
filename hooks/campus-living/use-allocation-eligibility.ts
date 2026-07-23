'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ProgramEligibilityService } from '@/lib/services/campus-living/program-eligibility-service';
import type { QuoteUpfrontFeeInput, QuoteUpfrontFeeResult } from '@/types/hostel-fee-compute';

/**
 * Allocation-time eligibility + fee-preview hooks — PR γ.
 *
 * Thin consumers of work already shipped by PR β (program-eligibility-service)
 * and PR δ (fee-quote endpoint). This file adds NO new resolver and NO new
 * tables — it only wires the existing pieces into the allocation flow:
 *
 *   1. useLearnerProgramId  — reads learners_profiles.program_id (the view the
 *      allocation search uses, v_learner_hostelites, does NOT expose program_id,
 *      so we read the base table directly by learner id).
 *   2. useEffectiveRoomCategories / useEffectiveMessCategories — wrap β's
 *      ProgramEligibilityService.getEffective*Categories (institution-default →
 *      per-program-override fallback already implemented there).
 *   3. useFeeQuote — POSTs to δ's /api/campus-living/fee-quote (read-only).
 */

const ALLOC_ELIG_KEY = ['campus-living', 'allocation-eligibility'] as const;

/**
 * Resolve a learner's program_id from learners_profiles. Returns null when the
 * learner has no program on record (e.g. legacy rows) — callers should treat a
 * null program as "no eligibility resolvable → fail open".
 */
export function useLearnerProgramId(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...ALLOC_ELIG_KEY, 'program-id', learnerId ?? null],
    queryFn: async (): Promise<string | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('learners_profiles')
        .select('program_id')
        .eq('id', learnerId!)
        .maybeSingle();
      if (error) throw new Error(error.message || 'Failed to resolve learner program');
      return (data?.program_id as string | null | undefined) ?? null;
    },
    enabled: !!learnerId,
    staleTime: 10 * 60 * 1000, // a learner's program rarely changes mid-session
  });
}

/**
 * Fee-aware effective room-category ids for a learner (program → quota → fee
 * band). The whole decision lives in the composite SQL fn. [] => fail open.
 */
export function useEffectiveRoomCategories(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...ALLOC_ELIG_KEY, 'room-cats', learnerId ?? null],
    queryFn: () => ProgramEligibilityService.getEffectiveRoomCategories(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fee-aware effective mess-category ids for a learner. */
export function useEffectiveMessCategories(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...ALLOC_ELIG_KEY, 'mess-cats', learnerId ?? null],
    queryFn: () => ProgramEligibilityService.getEffectiveMessCategories(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Read-only upfront fee quote for a chosen room + category + occupancy +
 * hostel year. Consumes δ's POST /api/campus-living/fee-quote. PREVIEW only —
 * it never binds/charges. Disabled until every required input is present.
 */
export function useFeeQuote(input: Partial<QuoteUpfrontFeeInput> | null) {
  const ready =
    !!input?.roomId &&
    !!input?.roomCategoryId &&
    !!input?.hostelYearId &&
    typeof input?.activeOccupants === 'number' &&
    input.activeOccupants >= 1;

  return useQuery({
    queryKey: [
      ...ALLOC_ELIG_KEY,
      'fee-quote',
      input?.roomId ?? null,
      input?.roomCategoryId ?? null,
      input?.messCategoryId ?? null,
      input?.hostelYearId ?? null,
      input?.activeOccupants ?? null,
      input?.joinDate ?? null,
    ],
    queryFn: async (): Promise<QuoteUpfrontFeeResult> => {
      const response = await fetch('/api/campus-living/fee-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: input!.roomId,
          roomCategoryId: input!.roomCategoryId,
          activeOccupants: input!.activeOccupants,
          messCategoryId: input!.messCategoryId ?? null,
          hostelYearId: input!.hostelYearId,
          joinDate: input!.joinDate ?? null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Failed to compute fee quote');
      }
      return (await response.json()) as QuoteUpfrontFeeResult;
    },
    enabled: ready,
    staleTime: 60 * 1000,
    retry: false,
  });
}
