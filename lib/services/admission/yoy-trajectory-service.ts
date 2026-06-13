import { createClientSupabaseClient } from '@/lib/supabase/client';

export type YoYTrajectoryRow = {
  /** Cycle year (e.g., 2024 for the 2024-25 cohort) */
  year: number;
  /** Days since April 1 of `year` (Director-locked anchor). Negative for pre-April admissions. */
  dayN: number;
  /** Cumulative admitted count for this year up to and including `dayN`. */
  cumulativeAdmitted: number;
};

export type YoYExcludedCourse = {
  institutionId: string;
  institutionName: string;
  programId: string;
  programName: string;
  yearsWithData: number[];
  exclusionReason: 'single_year_only' | 'two_years_only' | 'unknown_reason';
};

export type YoYTrajectoryPayload = {
  trajectory: YoYTrajectoryRow[];
  excludedCourses: YoYExcludedCourse[];
};

export type YoYInstitutionRow = {
  institutionId: string;
  institutionName: string;
  dayN: number;
  cumulativeAdmitted: number;
};

export type YoYDrillRow = {
  /** 'institution' or 'program' */
  kind: 'institution' | 'program';
  /** Display name (institution name, or "Institution / Program" composite) */
  name: string;
  cumulative: number;
};

export type YoYCategoryRow = {
  category: string;
  year: number;
  dayN: number;
  cumulativeAdmitted: number;
};

export type YoYHealthSignal = {
  institutionId: string;
  institutionName: string;
  sanctionedIntake: number;
  currentAdmitted: number;
  priorYearAdmittedSameDay: number;
  priorYearFinal: number;
  fillPctCurrent: number | null;
  fillPctPriorSameDay: number | null;
  reservedCount: number;
  staleReservedCount: number;
  signal: 'RED' | 'AMBER' | 'GREEN' | 'NA';
  paceDeltaPct: number | null;
};

export type YoYDepositLeak = {
  programId: string;
  programName: string;
  institutionName: string;
  reservedCount: number;
  admittedCount: number;
  stale14dCount: number;
  avgStaleDays: number;
};

export type YoYCounselorGridCell = {
  institutionId: string;
  institutionName: string;
  counselorId: string | null;
  counselorName: string;
  staleReservedCount: number;
  totalReservedCount: number;
};

export type YoYFirstTouchBreach = {
  kind: 'total' | 'by_institution' | 'by_counselor';
  institutionId: string | null;
  institutionName: string;
  counselorId: string | null;
  counselorName: string;
  breachCount: number;
};

export type YoYDaysToCatchUp = {
  institutionId: string;
  institutionName: string;
  currentAdmitted: number;
  priorFinal: number;
  /** priorFinal - currentAdmitted. Positive = behind LY; negative = past LY. */
  gap: number;
  /** Average admissions/day over the last 7 days for this institution. Min-clamped at 0.1. */
  dailyPaceLast7d: number;
  /** Days needed at current pace to close `gap`. null when gap <= 0 (already at/past LY). */
  daysToCatchUp: number | null;
  /** Days remaining until the cycle window end date (default Aug 31). */
  daysRemaining: number;
  signal: 'RED' | 'AMBER' | 'GREEN' | 'NA';
  /** currentAdmitted + ROUND(dailyPaceLast7d × daysRemaining). */
  projectedFinal: number;
};

export class YoYTrajectoryService {
  /**
   * Fetch the default group-wide YoY trajectory + excluded-courses metadata.
   * Powers the Zone 2 chart's institution-view mode (default).
   */
  static async getTrajectory(institutionId?: string): Promise<YoYTrajectoryPayload> {
    const supabase = createClientSupabaseClient();
    const param = institutionId ? { p_institution_id: institutionId } : {};

    const [trajResult, exclResult] = await Promise.all([
      supabase.rpc('fn_yoy_admission_trajectory' as never, param as never),
      supabase.rpc('fn_yoy_excluded_courses' as never, param as never),
    ]);

    if (trajResult.error) throw new Error(`Trajectory RPC failed: ${trajResult.error.message}`);
    if (exclResult.error) throw new Error(`Excluded-courses RPC failed: ${exclResult.error.message}`);

    type RawTrajRow = { out_year: number; out_day_n: number; out_cumulative_admitted: number };
    type RawExclRow = {
      out_institution_id: string;
      out_institution_name: string;
      out_program_id: string;
      out_program_name: string;
      out_years_with_data: number[];
      out_exclusion_reason: YoYExcludedCourse['exclusionReason'];
    };

    const trajectory: YoYTrajectoryRow[] = (trajResult.data as unknown as RawTrajRow[]).map((r) => ({
      year: r.out_year,
      dayN: r.out_day_n,
      cumulativeAdmitted: Number(r.out_cumulative_admitted),
    }));

    const excludedCourses: YoYExcludedCourse[] = (exclResult.data as unknown as RawExclRow[]).map((r) => ({
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      programId: r.out_program_id,
      programName: r.out_program_name,
      yearsWithData: r.out_years_with_data,
      exclusionReason: r.out_exclusion_reason,
    }));

    return { trajectory, excludedCourses };
  }

  /**
   * Fetch per-institution sub-trajectories for ONE year. Powers the
   * click-year-legend drill-down that redraws the chart with 8 institutional
   * sub-curves replacing the single aggregated line.
   */
  static async getPerInstitutionTrajectory(
    year: number,
    institutionId?: string,
  ): Promise<YoYInstitutionRow[]> {
    const supabase = createClientSupabaseClient();
    const params: Record<string, unknown> = { p_year: year };
    if (institutionId) params.p_institution_id = institutionId;

    const result = await supabase.rpc(
      'fn_yoy_per_institution_trajectory' as never,
      params as never,
    );
    if (result.error) throw new Error(`Per-institution RPC failed: ${result.error.message}`);

    type Raw = {
      out_institution_id: string;
      out_institution_name: string;
      out_day_n: number;
      out_cumulative_admitted: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      dayN: r.out_day_n,
      cumulativeAdmitted: Number(r.out_cumulative_admitted),
    }));
  }

  /**
   * Fetch top 5 institutions + top 5 programs contributing to the cumulative
   * at (year, day_n). Powers the click-point Sheet drill-down.
   */
  static async getDrillAtDay(
    year: number,
    dayN: number,
    institutionId?: string,
  ): Promise<YoYDrillRow[]> {
    const supabase = createClientSupabaseClient();
    const params: Record<string, unknown> = { p_year: year, p_day_n: dayN };
    if (institutionId) params.p_institution_id = institutionId;

    const result = await supabase.rpc('fn_yoy_drill_at_day' as never, params as never);
    if (result.error) throw new Error(`Drill-at-day RPC failed: ${result.error.message}`);

    type Raw = { out_kind: 'institution' | 'program'; out_name: string; out_cumulative: number };
    return (result.data as unknown as Raw[]).map((r) => ({
      kind: r.out_kind,
      name: r.out_name,
      cumulative: Number(r.out_cumulative),
    }));
  }

  /**
   * Fetch trajectory grouped by program-category × year. Powers the
   * "Show by category" toggle.
   */
  /** 8-college Health Stoplight signals. Powers the actionable strip above the chart. */
  static async getInstitutionHealth(institutionId?: string): Promise<YoYHealthSignal[]> {
    const supabase = createClientSupabaseClient();
    const param = institutionId ? { p_institution_id: institutionId } : {};
    const result = await supabase.rpc('fn_yoy_institution_health_signals' as never, param as never);
    if (result.error) throw new Error(`Health-signals RPC failed: ${result.error.message}`);
    type Raw = {
      out_institution_id: string;
      out_institution_name: string;
      out_sanctioned_intake: number;
      out_current_admitted: number;
      out_prior_year_admitted_same_day: number;
      out_prior_year_final: number;
      out_fill_pct_current: string | null;
      out_fill_pct_prior_same_day: string | null;
      out_reserved_count: number;
      out_stale_reserved_count: number;
      out_signal: 'RED' | 'AMBER' | 'GREEN' | 'NA';
      out_pace_delta_pct: string | null;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      sanctionedIntake: Number(r.out_sanctioned_intake),
      currentAdmitted: Number(r.out_current_admitted),
      priorYearAdmittedSameDay: Number(r.out_prior_year_admitted_same_day),
      priorYearFinal: Number(r.out_prior_year_final),
      fillPctCurrent: r.out_fill_pct_current === null ? null : Number(r.out_fill_pct_current),
      fillPctPriorSameDay: r.out_fill_pct_prior_same_day === null ? null : Number(r.out_fill_pct_prior_same_day),
      reservedCount: Number(r.out_reserved_count),
      staleReservedCount: Number(r.out_stale_reserved_count),
      signal: r.out_signal,
      paceDeltaPct: r.out_pace_delta_pct === null ? null : Number(r.out_pace_delta_pct),
    }));
  }

  /** Top N programs by deposits-leaking. Powers the worklist panel. */
  static async getDepositsLeaking(institutionId?: string, topN = 5): Promise<YoYDepositLeak[]> {
    const supabase = createClientSupabaseClient();
    const params: Record<string, unknown> = { p_top_n: topN };
    if (institutionId) params.p_institution_id = institutionId;
    const result = await supabase.rpc('fn_yoy_deposits_leaking' as never, params as never);
    if (result.error) throw new Error(`Deposits-leaking RPC failed: ${result.error.message}`);
    type Raw = {
      out_program_id: string;
      out_program_name: string;
      out_institution_name: string;
      out_reserved_count: number;
      out_admitted_count: number;
      out_stale_14d_count: number;
      out_avg_stale_days: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      programId: r.out_program_id,
      programName: r.out_program_name,
      institutionName: r.out_institution_name,
      reservedCount: Number(r.out_reserved_count),
      admittedCount: Number(r.out_admitted_count),
      stale14dCount: Number(r.out_stale_14d_count),
      avgStaleDays: Number(r.out_avg_stale_days),
    }));
  }

  /** institution × counsellor matrix of stale leads. Powers the accountability grid. */
  static async getCounselorGrid(institutionId?: string): Promise<YoYCounselorGridCell[]> {
    const supabase = createClientSupabaseClient();
    const param = institutionId ? { p_institution_id: institutionId } : {};
    const result = await supabase.rpc('fn_yoy_counselor_accountability_grid' as never, param as never);
    if (result.error) throw new Error(`Counselor-grid RPC failed: ${result.error.message}`);
    type Raw = {
      out_institution_id: string;
      out_institution_name: string;
      out_counselor_id: string | null;
      out_counselor_name: string;
      out_stale_reserved_count: number;
      out_total_reserved_count: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      counselorId: r.out_counselor_id,
      counselorName: r.out_counselor_name,
      staleReservedCount: Number(r.out_stale_reserved_count),
      totalReservedCount: Number(r.out_total_reserved_count),
    }));
  }

  /** Leads with no activity within 48h of capture. Powers the SLA breach list. */
  static async getFirstTouchBreaches(institutionId?: string, windowDays = 7): Promise<YoYFirstTouchBreach[]> {
    const supabase = createClientSupabaseClient();
    const params: Record<string, unknown> = { p_window_days: windowDays };
    if (institutionId) params.p_institution_id = institutionId;
    const result = await supabase.rpc('fn_yoy_first_touch_breaches' as never, params as never);
    if (result.error) throw new Error(`First-touch-breaches RPC failed: ${result.error.message}`);
    type Raw = {
      out_kind: 'total' | 'by_institution' | 'by_counselor';
      out_institution_id: string | null;
      out_institution_name: string;
      out_counselor_id: string | null;
      out_counselor_name: string;
      out_breach_count: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      kind: r.out_kind,
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      counselorId: r.out_counselor_id,
      counselorName: r.out_counselor_name,
      breachCount: Number(r.out_breach_count),
    }));
  }

  /** Per-institution days-to-catch-up countdown. Powers the 5th actionable view. */
  static async getDaysToCatchUp(
    institutionId?: string,
    windowEndMonth = 8,
    windowEndDay = 31,
  ): Promise<YoYDaysToCatchUp[]> {
    const supabase = createClientSupabaseClient();
    const params: Record<string, unknown> = {
      p_window_end_month: windowEndMonth,
      p_window_end_day: windowEndDay,
    };
    if (institutionId) params.p_institution_id = institutionId;
    const result = await supabase.rpc(
      'fn_yoy_days_to_catchup_per_institution' as never,
      params as never,
    );
    if (result.error) throw new Error(`Days-to-catchup RPC failed: ${result.error.message}`);
    type Raw = {
      out_institution_id: string;
      out_institution_name: string;
      out_current_admitted: number;
      out_prior_final: number;
      out_gap: number;
      out_daily_pace_last_7d: string | number;
      out_days_to_catchup: number | null;
      out_days_remaining: number;
      out_signal: 'RED' | 'AMBER' | 'GREEN' | 'NA';
      out_projected_final: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      institutionId: r.out_institution_id,
      institutionName: r.out_institution_name,
      currentAdmitted: Number(r.out_current_admitted),
      priorFinal: Number(r.out_prior_final),
      gap: Number(r.out_gap),
      dailyPaceLast7d: Number(r.out_daily_pace_last_7d),
      daysToCatchUp: r.out_days_to_catchup === null ? null : Number(r.out_days_to_catchup),
      daysRemaining: Number(r.out_days_remaining),
      signal: r.out_signal,
      projectedFinal: Number(r.out_projected_final),
    }));
  }

  static async getPerCategoryTrajectory(institutionId?: string): Promise<YoYCategoryRow[]> {
    const supabase = createClientSupabaseClient();
    const param = institutionId ? { p_institution_id: institutionId } : {};

    const result = await supabase.rpc(
      'fn_yoy_per_category_trajectory' as never,
      param as never,
    );
    if (result.error) throw new Error(`Per-category RPC failed: ${result.error.message}`);

    type Raw = {
      out_category: string;
      out_year: number;
      out_day_n: number;
      out_cumulative_admitted: number;
    };
    return (result.data as unknown as Raw[]).map((r) => ({
      category: r.out_category,
      year: r.out_year,
      dayN: r.out_day_n,
      cumulativeAdmitted: Number(r.out_cumulative_admitted),
    }));
  }
}
