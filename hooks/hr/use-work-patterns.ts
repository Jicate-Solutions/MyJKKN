'use client';

/**
 * HR Work Patterns — React Query hooks.
 * Created: 2026-09-04.
 *
 * Query keys are module-local consts, like hooks/hr/use-shift-timings.ts:
 * lib/query/query-keys.ts has no `hr` section and no HR importer.
 *
 * NOTHING SELF-REFRESHES in this app (staleTime 5 min, no focus refetch), so a
 * mutation here has to invalidate every OTHER module it changes: a pattern
 * assignment moves shift-timing coverage, attendance verdicts and leave
 * balances, and each of those pages would otherwise keep showing the old
 * figures until reload.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  WorkPatternService,
  type AssignWorkPatternParams,
} from '@/lib/services/hr/work-pattern-service';
import {
  recomputeAttendance,
  todayISO,
  type RecomputeSummary,
} from '@/lib/services/hr/attendance-recompute-service';
import type {
  AssignWorkPatternResult,
  HRWorkPatternInsert,
  HRWorkPatternUpdate,
  WorkPatternEntitlementInput,
} from '@/types/hr-work-patterns';

const KEY = 'hr-work-patterns';

/** Keys owned by other modules that an assignment changes. */
const CROSS_MODULE_KEYS: readonly string[] = [
  'hr-shift-timings',
  'hr-shift-timing-coverage',
  'hr-shift-timing-overrides',
  'hr-attendance-records',
  'hr-attendance-exceptions',
  'hr-attendance-months',
  'hr-leave-staff-balances',
  'hr-leave-balance-analytics',
  'hr-leave-balance',
];

/**
 * Patterns of the given institutions. Pass every accessible id for "All
 * institutions"; the array is part of the key, so switching scope refetches.
 */
export function useWorkPatterns(institutionIds: readonly string[] | null, asOf?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'list', institutionIds ?? null, asOf ?? null],
    queryFn: () => WorkPatternService.list(supabase, institutionIds!, asOf),
    enabled: Boolean(institutionIds && institutionIds.length > 0),
  });
}

export function useWorkPattern(id: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'one', id],
    queryFn: () => WorkPatternService.get(supabase, id!),
    enabled: Boolean(id),
  });
}

/** Day-based leave types of the institution, for the entitlement editor. */
export function useWorkPatternLeaveTypes(institutionId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'leave-types', institutionId],
    queryFn: () => WorkPatternService.listLeaveTypes(supabase, institutionId!),
    enabled: Boolean(institutionId),
  });
}

export function useWorkPatternEntitlements(patternId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'entitlements', patternId],
    queryFn: () => WorkPatternService.getEntitlements(supabase, patternId!),
    enabled: Boolean(patternId),
  });
}

export function useWorkPatternMembers(patternId: string | null, asOf?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'members', patternId, asOf ?? null],
    queryFn: () => WorkPatternService.listMembers(supabase, patternId!, asOf),
    enabled: Boolean(patternId),
  });
}

/** Every active HR staff member of the institution, with what they hold today. */
export function useAssignableStaff(institutionId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'assignable', institutionId],
    queryFn: () => WorkPatternService.listAssignableStaff(supabase, institutionId!),
    enabled: Boolean(institutionId),
  });
}

/** The pattern one staff member holds today — the profile badge. */
export function useStaffWorkPattern(staffId: string | undefined) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'staff', staffId ?? null],
    queryFn: () => WorkPatternService.getForStaff(supabase, staffId!),
    enabled: Boolean(staffId),
  });
}

export function useCreateWorkPattern() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (input: HRWorkPatternInsert) => WorkPatternService.create(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useUpdateWorkPattern() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HRWorkPatternUpdate }) =>
      WorkPatternService.update(supabase, id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      // Deactivating a pattern changes what the coverage card should count.
      qc.invalidateQueries({ queryKey: ['hr-shift-timing-coverage'] });
    },
  });
}

/** Delete a never-held pattern. The server refuses, with the reason, otherwise. */
export function useDeleteWorkPattern() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => WorkPatternService.delete(supabase, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      // Its week rows are gone too.
      qc.invalidateQueries({ queryKey: ['hr-shift-timings'] });
      qc.invalidateQueries({ queryKey: ['hr-shift-timing-coverage'] });
    },
  });
}

export function useSaveWorkPatternEntitlements() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ patternId, rows }: { patternId: string; rows: WorkPatternEntitlementInput[] }) =>
      WorkPatternService.saveEntitlements(supabase, patternId, rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export interface AssignWorkPatternOutcome {
  result: AssignWorkPatternResult;
  /** Null when the change is scheduled for a future date, or when it failed. */
  recompute: RecomputeSummary | null;
  recomputeError: string | null;
}

/**
 * Assign (patternId set) or remove (patternId null), then re-judge attendance
 * from the effective date to today — the same follow-through as saving a
 * shift-timing week, because a pattern IS a week for its members.
 *
 * A failed recompute must not read as a failed assignment: by then the
 * assignment and the balance resync ARE written. It is surfaced separately.
 */
export function useAssignWorkPattern() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: async (
      params: AssignWorkPatternParams & { institutionId: string },
    ): Promise<AssignWorkPatternOutcome> => {
      const result = await WorkPatternService.assign(supabase, params);

      const today = todayISO();
      if (params.effectiveFrom > today) {
        return { result, recompute: null, recomputeError: null };
      }

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
        console.error('[useAssignWorkPattern] recompute failed:', err);
      }

      return { result, recompute, recomputeError };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      for (const key of CROSS_MODULE_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
