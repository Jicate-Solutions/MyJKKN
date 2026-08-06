'use client';

/**
 * HR Shift Timings — React Query hooks.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
 *
 * Query keys are a module-local const, matching hooks/hr/use-hr-leave-types.ts.
 * lib/query/query-keys.ts has no `hr` section and no HR importer, so a group
 * added there would be dead code.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ShiftTimingService,
  type GetWeekParams,
  type SaveWeekParams,
} from '@/lib/services/hr/shift-timing-service';

const KEY = 'hr-shift-timings';
const COVERAGE_KEY = 'hr-shift-timing-coverage';
const CATEGORIES_KEY = 'hr-employment-categories';
const OVERRIDES_KEY = 'hr-shift-timing-overrides';

/** The week in force for one (institution, scope, category). */
export function useShiftTimingWeek(params: GetWeekParams | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => ShiftTimingService.getWeek(supabase, params!),
    enabled: Boolean(params?.institutionId),
  });
}

/** Which category overrides exist for an institution. */
export function useShiftTimingOverrides(institutionId: string | null, asOf?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [OVERRIDES_KEY, institutionId, asOf ?? null],
    queryFn: () => ShiftTimingService.listCategoryOverrides(supabase, institutionId!, asOf),
    enabled: Boolean(institutionId),
  });
}

/** Per-category coverage warning data. */
export function useShiftTimingCoverage(institutionId: string | null, date?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [COVERAGE_KEY, institutionId, date ?? null],
    queryFn: () => ShiftTimingService.getCoverage(supabase, institutionId!, date),
    enabled: Boolean(institutionId),
  });
}

/** Employment categories for the override picker. Global list; rarely changes. */
export function useEmploymentCategories() {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [CATEGORIES_KEY],
    queryFn: () => ShiftTimingService.listEmploymentCategories(supabase),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Save a whole week. Invalidates the week, the coverage strip and the override
 * list — a new category override changes all three.
 */
export function useSaveShiftTimingWeek() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (params: SaveWeekParams) => ShiftTimingService.saveWeek(supabase, params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [COVERAGE_KEY] });
      qc.invalidateQueries({ queryKey: [OVERRIDES_KEY] });
    },
  });
}
