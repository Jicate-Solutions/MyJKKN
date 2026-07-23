'use client';

/**
 * ARPS Phase 2B — cycle setup hook
 *
 * Reads + writes the per-(institution, cycle_year) revenue target and cost
 * baseline tables. The read returns the full 24-row grid (8 institutions ×
 * 3 cycle years) even where data is unset, so the form can render empty
 * cells for the user to fill in.
 *
 * Writes use SECURITY DEFINER RPCs (anon-locked) and invalidate the read
 * cache on success.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ArpsCycleSetupRow {
  institution_id: string;
  institution_name: string;
  cycle_year: number;
  target_admits: number | null;
  target_yield_per_seat: number | null;
  derived_target_revenue: number | null;
  fixed_operating_cost: number | null;
  marketing_budget_allocated: number | null;
  total_baseline_cost: number | null;
  target_set_at: string | null;
  cost_set_at: string | null;
}

export const arpsSetupKeys = {
  all: ['arps-setup'] as const,
  cycleSetup: (years?: number[]) =>
    [...arpsSetupKeys.all, 'cycle-setup', years ?? [2024, 2025, 2026]] as const,
};

export function useArpsCycleSetup(cycleYears: number[] = [2024, 2025, 2026]) {
  const supabase = createClientSupabaseClient();

  return useQuery<ArpsCycleSetupRow[]>({
    queryKey: arpsSetupKeys.cycleSetup(cycleYears),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_arps_list_cycle_setup', {
        p_cycle_years: cycleYears,
      });
      if (error) throw error;
      const rows = (data as Array<Record<string, unknown>>) ?? [];
      return rows.map((r) => ({
        institution_id: r.out_institution_id as string,
        institution_name: r.out_institution_name as string,
        cycle_year: r.out_cycle_year as number,
        target_admits: (r.out_target_admits as number | null) ?? null,
        target_yield_per_seat: (r.out_target_yield_per_seat as number | null) ?? null,
        derived_target_revenue: (r.out_derived_target_revenue as number | null) ?? null,
        fixed_operating_cost: (r.out_fixed_operating_cost as number | null) ?? null,
        marketing_budget_allocated:
          (r.out_marketing_budget_allocated as number | null) ?? null,
        total_baseline_cost: (r.out_total_baseline_cost as number | null) ?? null,
        target_set_at: (r.out_target_set_at as string | null) ?? null,
        cost_set_at: (r.out_cost_set_at as string | null) ?? null,
      }));
    },
    staleTime: 60 * 1000,
  });
}

export interface UpsertRevenueTargetInput {
  institution_id: string;
  cycle_year: number;
  target_admits?: number | null;
  target_yield_per_seat?: number | null;
  notes?: string | null;
}

export function useUpsertRevenueTarget() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertRevenueTargetInput) => {
      const { data, error } = await supabase.rpc('fn_arps_upsert_revenue_target', {
        p_institution_id: input.institution_id,
        p_cycle_year: input.cycle_year,
        p_target_admits: input.target_admits ?? null,
        p_target_yield_per_seat: input.target_yield_per_seat ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arpsSetupKeys.all });
    },
  });
}

export interface UpsertCostBaselineInput {
  institution_id: string;
  cycle_year: number;
  fixed_operating_cost?: number | null;
  marketing_budget_allocated?: number | null;
  notes?: string | null;
}

export function useUpsertCostBaseline() {
  const supabase = createClientSupabaseClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertCostBaselineInput) => {
      const { data, error } = await supabase.rpc('fn_arps_upsert_cost_baseline', {
        p_institution_id: input.institution_id,
        p_cycle_year: input.cycle_year,
        p_fixed_operating_cost: input.fixed_operating_cost ?? null,
        p_marketing_budget_allocated: input.marketing_budget_allocated ?? null,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arpsSetupKeys.all });
    },
  });
}
