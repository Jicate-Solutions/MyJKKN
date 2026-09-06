/**
 * Bed Economics service — typed wrappers over the 7 fn_bed_econ_* RPCs.
 *
 * Structure copied from lib/services/admission/yoy-trajectory-service.ts:
 * static methods, browser client singleton (createClientSupabaseClient), each
 * method maps one RPC and surfaces errors. All RPCs are super-admin-gated
 * server-side (they RAISE 42501 for non-super-admins) and anon-revoked.
 *
 * Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §9 / §11.
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BedEconReadiness,
  BedEconSummary,
  BedEconBlockRow,
  BedEconVacancyRow,
  BedEconCostRow,
  BedEconTrendRow,
  BedEconConsolidation,
  BedEconPremiumPotentialRow,
} from '@/types/bed-economics';

export class BedEconomicsService {
  /** R1-R4 day-1 readiness checklist for a hostel year. */
  static async getReadiness(hostelYearId: string): Promise<BedEconReadiness> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_readiness' as never,
      { p_hostel_year_id: hostelYearId } as never,
    );
    if (error) throw new Error(`Bed-econ readiness RPC failed: ${error.message}`);
    return data as unknown as BedEconReadiness;
  }

  /** U1-U3 + V1-V10 headline summary. institutionId omitted/undefined = network. */
  static async getSummary(
    hostelYearId: string,
    institutionId?: string,
  ): Promise<BedEconSummary> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_summary' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ summary RPC failed: ${error.message}`);
    return data as unknown as BedEconSummary;
  }

  /** Per-block league table (incl. cost columns with missing flags). */
  static async getBlockGrid(
    hostelYearId: string,
    institutionId?: string,
  ): Promise<BedEconBlockRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_block_grid' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ block-grid RPC failed: ${error.message}`);
    return (data as unknown as BedEconBlockRow[]) ?? [];
  }

  /** Vacant sellable rooms/beds + days/discount detail (action panel). */
  static async getVacancyDetail(
    hostelYearId: string,
    institutionId?: string,
  ): Promise<BedEconVacancyRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_vacancy_detail' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ vacancy-detail RPC failed: ${error.message}`);
    return (data as unknown as BedEconVacancyRow[]) ?? [];
  }

  /** C1-C5 cost & return per block, with missing_data flags. */
  static async getCostGrid(
    hostelYearId: string,
    institutionId?: string,
  ): Promise<BedEconCostRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_cost_grid' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ cost-grid RPC failed: ${error.message}`);
    return (data as unknown as BedEconCostRow[]) ?? [];
  }

  /** Occupancy trend rows from hostel_occupancy_snapshots (U4). */
  static async getTrend(
    hostelYearId: string,
    institutionId?: string,
    days = 365,
  ): Promise<BedEconTrendRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_trend' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
        p_days: days,
      } as never,
    );
    if (error) throw new Error(`Bed-econ trend RPC failed: ${error.message}`);
    return (data as unknown as BedEconTrendRow[]) ?? [];
  }

  /** C6 consolidation cost-savings scenario. */
  static async getConsolidation(
    hostelYearId: string,
    institutionId?: string,
  ): Promise<BedEconConsolidation> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_consolidation' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ consolidation RPC failed: ${error.message}`);
    return data as unknown as BedEconConsolidation;
  }

  /** Premium Revenue model — per gender×tier potential at an assumed base rate. */
  static async getPremiumPotential(
    hostelYearId: string,
    institutionId?: string,
    assumedBaseInr?: number,
  ): Promise<BedEconPremiumPotentialRow[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc(
      'fn_bed_econ_premium_potential' as never,
      {
        p_hostel_year_id: hostelYearId,
        p_institution_id: institutionId ?? null,
        p_assumed_base_inr: assumedBaseInr ?? null,
      } as never,
    );
    if (error) throw new Error(`Bed-econ premium potential RPC failed: ${error.message}`);
    return (data as unknown as BedEconPremiumPotentialRow[]) ?? [];
  }
}
