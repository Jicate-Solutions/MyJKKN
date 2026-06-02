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
  /** 3-line trajectory data — one row per (year, dayN). */
  trajectory: YoYTrajectoryRow[];
  /**
   * Programs filtered out by the common-courses intersection. Chart uses this
   * to render the BDS-style placeholder line for programs tracked outside
   * MyJKKN (e.g., TN MCC state counselling for BDS UG).
   */
  excludedCourses: YoYExcludedCourse[];
};

export class YoYTrajectoryService {
  /**
   * Fetch the YoY admission trajectory + excluded-courses metadata.
   * Calls two RPCs in parallel:
   *   - fn_yoy_admission_trajectory: cumulative trajectory per year × day_n
   *   - fn_yoy_excluded_courses: programs filtered out by common-courses intersection
   *
   * Pass `institutionId` for the scoped "My institution only" view; omit for
   * group-wide.
   */
  static async getTrajectory(institutionId?: string): Promise<YoYTrajectoryPayload> {
    const supabase = createClientSupabaseClient();
    const param = institutionId ? { p_institution_id: institutionId } : {};

    // Cast through `never` because the generated Supabase types don't yet
    // include the new fn_yoy_admission_trajectory / fn_yoy_excluded_courses
    // RPCs added in migration 20260602205000. Regenerating types would touch
    // a large generated file; the unknown-cast pattern matches several other
    // services in this codebase (see lib/services/admission/group-dashboard-service.ts).
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
}
