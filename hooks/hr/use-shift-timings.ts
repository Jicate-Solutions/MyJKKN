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
import {
  recomputeAttendance,
  todayISO,
  type RecomputeSummary,
} from '@/lib/services/hr/attendance-recompute-service';

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
 * Save a whole week, then re-judge the attendance that timing already decided.
 *
 * The recompute is part of the mutation, not a separate call the caller may
 * forget: before 2026-08-09 a timing edit changed nothing that had already been
 * imported, so raising grace to fix a docked day fixed the rule and left the
 * day wrong. hr_shift_timings has no recompute trigger of its own (unlike
 * institution_leaves and hr_leave_applications, which both fan into
 * hr_attendance_records), and a SQL one would be a second copy of the rule.
 *
 * Scope is [effectiveFrom, today] for this institution — exactly the days the
 * edit can have changed. A future-dated (scheduled) change has nothing to
 * recompute and skips the call.
 *
 * Invalidates the week, the coverage strip and the override list — a new
 * category override changes all three — plus the attendance caches, so an open
 * My Attendance tab reflects the new verdicts.
 */
export function useSaveShiftTimingWeek() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: async (params: SaveWeekParams) => {
      const written = await ShiftTimingService.saveWeek(supabase, params);

      const today = todayISO();
      if (params.effectiveFrom > today) {
        return { written, recompute: null as RecomputeSummary | null };
      }

      // A failed recompute must not read as a failed save — the timing IS
      // saved by this point. Surface it as a partial result and let the caller
      // decide what to say.
      let recompute: RecomputeSummary | null = null;
      let recomputeError: string | null = null;
      try {
        recompute = await recomputeAttendance({
          institutionId: params.institutionId,
          from: params.effectiveFrom,
          to: today,
        });
      } catch (err) {
        recomputeError = err instanceof Error ? err.message : 'Recompute failed';
        console.error('[useSaveShiftTimingWeek] recompute failed:', err);
      }

      return { written, recompute, recomputeError };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: [COVERAGE_KEY] });
      qc.invalidateQueries({ queryKey: [OVERRIDES_KEY] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-records'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-exceptions'] });
      qc.invalidateQueries({ queryKey: ['hr-attendance-months'] });
    },
  });
}
