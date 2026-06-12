'use client';

/**
 * ARPS Phase 2C — Action log hooks
 *
 * Director-initiated lever-pull entry + listing for the
 * /admission/group-dashboard/actions page. Auto-detected entries
 * (scholarship awards, counselor reassignments, WhatsApp campaigns) are
 * deferred to a follow-on phase.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ArpsActionLogRow {
  id: string;
  triggered_at: string;
  institution_id: string | null;
  institution_name: string | null;
  program_id: string | null;
  program_name: string | null;
  cycle_year: number;
  trigger_day_n: number;
  trigger_fill_pct: number | null;
  trigger_expected_pct: number | null;
  trigger_gap_pp: number | null;
  lever_tier: number | null;
  lever_type: string | null;
  lever_magnitude_text: string | null;
  decision_reasoning: string | null;
  auto_detected: boolean;
  director_confirmed: boolean;
  outcome_captured_at: string | null;
  outcome_fill_pct: number | null;
  outcome_gap_pp_at_outcome: number | null;
  outcome_pace_closed: boolean | null;
  decided_by_email: string | null;
}

export const arpsActionKeys = {
  all: ['arps-action-log'] as const,
  list: (cycleYear: number, institutionId?: string | null) =>
    [...arpsActionKeys.all, 'list', cycleYear, institutionId ?? 'all'] as const,
};

export function useArpsActionLog(
  cycleYear: number,
  institutionId?: string | null,
) {
  const supabase = createClientSupabaseClient();
  return useQuery<ArpsActionLogRow[]>({
    queryKey: arpsActionKeys.list(cycleYear, institutionId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_arps_list_action_log', {
        p_cycle_year: cycleYear,
        p_institution_id: institutionId ?? null,
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      const rows = (data as Array<Record<string, unknown>>) ?? [];
      return rows.map((r) => ({
        id: r.out_id as string,
        triggered_at: r.out_triggered_at as string,
        institution_id: (r.out_institution_id as string | null) ?? null,
        institution_name: (r.out_institution_name as string | null) ?? null,
        program_id: (r.out_program_id as string | null) ?? null,
        program_name: (r.out_program_name as string | null) ?? null,
        cycle_year: r.out_cycle_year as number,
        trigger_day_n: r.out_trigger_day_n as number,
        trigger_fill_pct: (r.out_trigger_fill_pct as number | null) ?? null,
        trigger_expected_pct: (r.out_trigger_expected_pct as number | null) ?? null,
        trigger_gap_pp: (r.out_trigger_gap_pp as number | null) ?? null,
        lever_tier: (r.out_lever_tier as number | null) ?? null,
        lever_type: (r.out_lever_type as string | null) ?? null,
        lever_magnitude_text: (r.out_lever_magnitude_text as string | null) ?? null,
        decision_reasoning: (r.out_decision_reasoning as string | null) ?? null,
        auto_detected: r.out_auto_detected as boolean,
        director_confirmed: r.out_director_confirmed as boolean,
        outcome_captured_at: (r.out_outcome_captured_at as string | null) ?? null,
        outcome_fill_pct: (r.out_outcome_fill_pct as number | null) ?? null,
        outcome_gap_pp_at_outcome:
          (r.out_outcome_gap_pp_at_outcome as number | null) ?? null,
        outcome_pace_closed: (r.out_outcome_pace_closed as boolean | null) ?? null,
        decided_by_email: (r.out_decided_by_email as string | null) ?? null,
      }));
    },
    staleTime: 30 * 1000,
  });
}

export interface LogDirectorActionInput {
  institution_id: string;
  program_id?: string | null;
  cycle_year?: number | null;
  lever_tier: number;
  lever_type: string;
  lever_magnitude_text?: string | null;
  lever_magnitude_numeric?: number | null;
  target_program_ids?: string[] | null;
  decision_reasoning?: string | null;
}

export function useLogDirectorAction() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogDirectorActionInput) => {
      const { data, error } = await supabase.rpc('fn_arps_log_director_action', {
        p_institution_id: input.institution_id,
        p_program_id: input.program_id ?? null,
        p_cycle_year: input.cycle_year ?? null,
        p_lever_tier: input.lever_tier,
        p_lever_type: input.lever_type,
        p_lever_magnitude_text: input.lever_magnitude_text ?? null,
        p_lever_magnitude_numeric: input.lever_magnitude_numeric ?? null,
        p_target_program_ids: input.target_program_ids ?? null,
        p_decision_reasoning: input.decision_reasoning ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arpsActionKeys.all });
    },
  });
}
