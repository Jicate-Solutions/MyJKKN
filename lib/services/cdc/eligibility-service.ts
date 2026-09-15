/**
 * CDC Drive Eligibility Service
 *
 * Reads and writes the one `cdc_drive_eligibility` row per drive that says WHO a
 * drive is for: which programs, which year, minimum CGPA, maximum arrears.
 *
 * Why this file exists (audit 2026-09-12): the table was created with the CDC
 * substrate in May 2026 and three separate code paths READ it —
 *   1. fn_cdc_emit_drive_notification / fn_cdc_emit_drive_email_notification
 *      (the `willingness_open` branch INNER JOINs it to find learners to notify),
 *   2. CdcWillingnessService.getLearnerWillingnessSnapshot → computeIsEligible,
 *   3. CdcWillingnessService.declare (snapshots the criteria at declaration time)
 * — but nothing could ever WRITE it. All 10 production drives had 0 eligibility
 * rows, so the notification found nobody and exited silently, no learner was ever
 * told about a drive, and no learner could declare willingness. This service plus
 * its API route and form are the missing writer.
 *
 * RLS already supports this: `cdc_drive_eligibility_write` is USING/WITH CHECK
 * `is_cdc_staff()`, and `cdc_drive_eligibility_read` is any authenticated user.
 * No migration is required.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CdcDriveEligibility, CdcDriveEligibilityInput } from '@/types/cdc';

/**
 * The minimum a drive needs before it can be opened for willingness.
 *
 * `program_ids` is the load-bearing field: the notification query matches
 * `learners_profiles.program_id = ANY(e.program_ids)` and the learner page matches
 * `eligibility.program_ids.includes(learner.program_id)`. An eligibility row with
 * an empty `program_ids` array resolves to zero learners in both, which is the
 * same silent dead-end as having no row at all — so the guard requires both.
 *
 * Pure function, no I/O: exported so the state-machine guard and its unit test
 * share one definition.
 */
export function isEligibilityReadyForWillingness(
  eligibility: Pick<CdcDriveEligibility, 'program_ids'> | null | undefined
): boolean {
  if (!eligibility) return false;
  if (!Array.isArray(eligibility.program_ids)) return false;
  return eligibility.program_ids.length > 0;
}

/** Message shown when the guard blocks a transition. Shared by API and UI. */
export const ELIGIBILITY_REQUIRED_MESSAGE =
  'Set the eligibility criteria before opening this drive for willingness. ' +
  'Until at least one program is chosen, no learner is notified and none can declare interest.';

export class CdcEligibilityService {
  /** The drive's eligibility row, or null when it has never been set. */
  static async getEligibility(
    supabase: SupabaseClient,
    driveId: string
  ): Promise<CdcDriveEligibility | null> {
    const { data, error } = await supabase
      .from('cdc_drive_eligibility')
      .select('*')
      .eq('drive_id', driveId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as CdcDriveEligibility | null;
  }

  /**
   * Create or replace the drive's eligibility row.
   *
   * One row per drive by design (every reader uses `.maybeSingle()`), so this
   * updates in place when a row exists and inserts when it does not, rather than
   * relying on a unique constraint that the substrate migration does not declare.
   */
  static async upsertEligibility(
    supabase: SupabaseClient,
    driveId: string,
    payload: CdcDriveEligibilityInput,
    userId: string
  ): Promise<CdcDriveEligibility> {
    const programIds = Array.isArray(payload.program_ids) ? payload.program_ids : [];
    if (programIds.length === 0) {
      throw new Error('Choose at least one program. Eligibility with no program reaches no learner.');
    }
    if (payload.min_cgpa != null && (payload.min_cgpa < 0 || payload.min_cgpa > 10)) {
      throw new Error('Minimum CGPA must be between 0 and 10.');
    }
    if (payload.max_arrears != null && payload.max_arrears < 0) {
      throw new Error('Maximum arrears cannot be negative.');
    }
    if (payload.min_semester != null && (payload.min_semester < 1 || payload.min_semester > 12)) {
      throw new Error('Minimum semester must be between 1 and 12.');
    }
    if (payload.program_year != null && (payload.program_year < 1 || payload.program_year > 6)) {
      throw new Error('Year of study must be between 1 and 6.');
    }

    const now = new Date().toISOString();
    const fields = {
      program_ids: programIds,
      min_cgpa: payload.min_cgpa ?? null,
      min_semester: payload.min_semester ?? null,
      max_arrears: payload.max_arrears ?? null,
      allowed_genders:
        Array.isArray(payload.allowed_genders) && payload.allowed_genders.length > 0
          ? payload.allowed_genders
          : null,
      program_year: payload.program_year ?? null,
      passed_out_allowed: payload.passed_out_allowed ?? false,
      additional_notes: payload.additional_notes?.trim() || null,
      updated_at: now,
      updated_by: userId,
    };

    const existing = await this.getEligibility(supabase, driveId);

    if (existing) {
      const { data, error } = await supabase
        .from('cdc_drive_eligibility')
        .update(fields)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as CdcDriveEligibility;
    }

    const { data, error } = await supabase
      .from('cdc_drive_eligibility')
      .insert({ ...fields, drive_id: driveId, created_at: now, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data as CdcDriveEligibility;
  }

  /**
   * How many active learners this criteria set currently matches.
   *
   * Mirrors the notification's own recipient query — same program match, same
   * `lifecycle_status IN ('active','graduated')` filter — so the number the CDC
   * team sees on the form is the number that will actually be notified, not an
   * optimistic estimate.
   *
   * MUST be called with a service-role client. `learners_profiles_select_policy`
   * requires one of learners.admissions.view / learners.profiles.view /
   * learners.view, none of which a CDC coordinator holds, and RLS denies by
   * returning ZERO ROWS rather than an error — so the browser client would report
   * a confident "0 learners" for criteria that actually match thousands. That is
   * the same RLS gap documented in app/api/cdc/pickers/semesters/route.ts.
   *
   * `institutionIds` re-imposes the drive's own institution scope on top of the
   * service-role read, so the count never spans institutions the drive does not
   * target.
   */
  static async countMatchingLearners(
    serviceRoleClient: SupabaseClient,
    programIds: string[],
    institutionIds: string[]
  ): Promise<number | null> {
    if (!programIds || programIds.length === 0) return 0;
    let query = serviceRoleClient
      .from('learners_profiles')
      .select('id', { count: 'exact', head: true })
      .in('program_id', programIds)
      .in('lifecycle_status', ['active', 'graduated']);

    if (institutionIds && institutionIds.length > 0) {
      query = query.in('institution_id', institutionIds);
    }

    const { count, error } = await query;
    if (error) {
      console.error('[cdc/eligibility-service] learner count failed:', error.message);
      return null;
    }
    return count ?? 0;
  }
}
