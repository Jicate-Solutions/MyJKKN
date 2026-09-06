/**
 * Teaching-Enterprise Cohorts Service
 *
 * Backs `/admin/teaching-cohorts` — the config-row screen for the
 * teaching-enterprise participant layer (spec
 * specs/teaching-enterprise-spine-generalization-2026-07-26.md, Phase 1b).
 *
 * Standing rule: every policy decision = a config-table row + a UI to write it.
 * The row that used to be a frozen WHERE clause inside
 * `fn_mba_associate_sync()` is now `public.teaching_enterprise_cohorts`, and
 * this screen is how it gets written — no PR, no migration, no deploy.
 *
 * READS AND WRITES BOTH GO THROUGH SECURITY DEFINER RPCs, never the base table:
 *   - `fn_teaching_cohort_list()`   — rows + resolved programme / department /
 *     institution names + live member counts.
 *   - `fn_teaching_cohort_update()` — the four editable fields.
 *
 * Why RPCs rather than a direct `.from('teaching_enterprise_cohorts')`:
 *   1. The base table stays read-only to clients (the repo's hardened-config
 *      pattern — a table with a SELECT policy but no UPDATE policy makes every
 *      UPDATE silently affect 0 rows, which looks like a saved edit that
 *      quietly vanished).
 *   2. The permission check lives in exactly one place, NULL-safe.
 *   3. The member counts need `user_roles` + `custom_roles`, which the browser
 *      client cannot join under RLS in one round trip.
 *
 * Both RPCs require `improvement.board.manage`, `is_admin()` or
 * `is_super_admin()`, and both are revoked from anon + PUBLIC.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'improvement/teaching-cohorts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What a cohort's participants DO with the board. */
export type ContributionMode = 'analyse' | 'build';

export const CONTRIBUTION_MODES: {
  value: ContributionMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'analyse',
    label: 'Analyse',
    hint: 'Reads the de-identified analytics for an assigned area and files an improvement idea.',
  },
  {
    value: 'build',
    label: 'Build',
    hint: 'Takes an approved idea and ships the change that resolves it.',
  },
];

/** One row of `fn_teaching_cohort_list()`. */
export interface TeachingCohort {
  cohort_key: string;
  display_name: string;
  program_id: string | null;
  program_name: string | null;
  department_id: string | null;
  department_name: string | null;
  semester_orders: number[] | null;
  learner_role_key: string;
  faculty_role_key: string | null;
  faculty_source: string;
  contribution_mode: ContributionMode;
  institution_id: string | null;
  institution_name: string | null;
  is_active: boolean;
  /** Live count of users holding `learner_role_key`. */
  learner_members: number;
  /** Live count of users holding `faculty_role_key` (0 when unset). */
  faculty_members: number;
  updated_at: string | null;
}

/** Editable fields. Omit a field (or pass null) to leave it unchanged. */
export interface TeachingCohortUpdate {
  display_name?: string | null;
  semester_orders?: number[] | null;
  contribution_mode?: ContributionMode | null;
  is_active?: boolean | null;
}

const QUERY_KEY = ['admin', 'teaching-cohorts'] as const;

// ---------------------------------------------------------------------------
// Helpers shared with the UI
// ---------------------------------------------------------------------------

/**
 * Parse the semester-window text input ("5, 6, 7") into a sorted, de-duplicated
 * list of positive integers. Returns null when the text cannot be read as a
 * non-empty list — the caller surfaces that as a validation message rather than
 * sending an empty window, which would match nobody.
 */
export function parseSemesterOrders(input: string): number[] | null {
  const parts = input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;

  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** Render a semester window back into the text the input shows. */
export function formatSemesterOrders(orders: number[] | null | undefined): string {
  return (orders ?? []).join(', ');
}

// ---------------------------------------------------------------------------
// Service — RPC calls only.
// ---------------------------------------------------------------------------

export class TeachingCohortsService {
  /** List every cohort config row with resolved names + live member counts. */
  static async list(): Promise<TeachingCohort[]> {
    const supabase = createClientSupabaseClient();

    // `teaching_enterprise_cohorts` and these RPCs are not in
    // types/supabase.ts, so the `as any` cast matches the existing mba-*
    // services and bug-report-service.
    const { data, error } = await (supabase as any).rpc(
      'fn_teaching_cohort_list',
    );

    if (error) {
      logger.error(LOG_MODULE, 'fn_teaching_cohort_list failed', error);
      throw new Error(error.message ?? 'Failed to load teaching cohorts');
    }
    return (data ?? []) as TeachingCohort[];
  }

  /**
   * Patch the editable fields of one cohort row.
   *
   * `cohort_key` is the immutable identity and is never sent as a new value —
   * only as the target. The programme, department and role keys are not
   * editable from the UI: repointing a cohort at a different programme is a
   * migration-grade decision, not a toggle.
   */
  static async update(
    cohortKey: string,
    patch: TeachingCohortUpdate,
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await (supabase as any).rpc('fn_teaching_cohort_update', {
      p_cohort_key: cohortKey,
      p_display_name: patch.display_name ?? null,
      p_semester_orders: patch.semester_orders ?? null,
      p_contribution_mode: patch.contribution_mode ?? null,
      p_is_active: patch.is_active ?? null,
    });

    if (error) {
      logger.error(
        LOG_MODULE,
        `fn_teaching_cohort_update failed for ${cohortKey}`,
        error,
      );
      throw new Error(error.message ?? 'Failed to save the cohort');
    }
  }
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

export function useTeachingCohorts(
  enabled = true,
): UseQueryResult<TeachingCohort[], Error> {
  return useQuery<TeachingCohort[], Error>({
    queryKey: QUERY_KEY,
    queryFn: () => TeachingCohortsService.list(),
    enabled,
    staleTime: 30 * 1000, // config rarely changes
  });
}

export function useUpdateTeachingCohort(): UseMutationResult<
  void,
  Error,
  { cohortKey: string; patch: TeachingCohortUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { cohortKey: string; patch: TeachingCohortUpdate }
  >({
    mutationFn: ({ cohortKey, patch }) =>
      TeachingCohortsService.update(cohortKey, patch),
    onSuccess: () => {
      // Re-fetch so member counts and updated_at reflect the write.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
