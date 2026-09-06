'use client';

/**
 * ARPS Phase 1 — Admission Revenue Pace System hook
 *
 * Calls fn_arps_pace_status RPC (migration 20260607143000) which returns
 * per-institution {sanctioned, admitted, actual_fill_pct, expected_fill_pct,
 * gap_pp, alert_severity}. Pace = avg of 2024 + 2025 same-day fill %.
 *
 * Director-locked design 2026-06-07: Family = institution. Alert thresholds
 * variable by stage (10pp early / 15pp mid / 20pp late). Alert-only — no
 * auto-action; Director decides which Tier 1-4 lever from escalation ladder.
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export type ArpsAlertSeverity =
  | 'EARLY-LAG'
  | 'MID-LAG'
  | 'LATE-LAG'
  | 'DATA-MISSING'
  | null;

export interface ArpsPaceRow {
  institution_id: string;
  institution_name: string;
  current_day_n: number;
  total_sanctioned: number;
  admitted_so_far: number;
  actual_fill_pct: number | null;
  expected_fill_pct: number | null;
  gap_pp: number | null;
  alert_severity: ArpsAlertSeverity;
  hp_2024_admitted: number;
  hp_2025_admitted: number;
}

export const arpsKeys = {
  all: ['arps'] as const,
  paceStatus: (institutionId?: string | null) =>
    [...arpsKeys.all, 'pace-status', institutionId ?? 'all'] as const,
};

export function useArpsPaceStatus(institutionId?: string | null) {
  const supabase = createClientSupabaseClient();

  return useQuery<ArpsPaceRow[]>({
    queryKey: arpsKeys.paceStatus(institutionId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_arps_pace_status', {
        p_institution_id: institutionId ?? null,
      });
      if (error) throw error;

      // RPC returns rows with `out_` prefix — strip it for ergonomic access.
      const rows = (data as Array<Record<string, unknown>>) ?? [];
      return rows.map((r) => ({
        institution_id: r.out_institution_id as string,
        institution_name: r.out_institution_name as string,
        current_day_n: r.out_current_day_n as number,
        total_sanctioned: r.out_total_sanctioned as number,
        admitted_so_far: r.out_admitted_so_far as number,
        actual_fill_pct: (r.out_actual_fill_pct as number | null) ?? null,
        expected_fill_pct: (r.out_expected_fill_pct as number | null) ?? null,
        gap_pp: (r.out_gap_pp as number | null) ?? null,
        alert_severity: (r.out_alert_severity as ArpsAlertSeverity) ?? null,
        hp_2024_admitted: r.out_hp_2024_admitted as number,
        hp_2025_admitted: r.out_hp_2025_admitted as number,
      }));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
