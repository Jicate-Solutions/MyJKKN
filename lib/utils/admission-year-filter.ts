/**
 * Resolve a calendar admission year to the `admission_years` row ids carrying it.
 *
 * WHY A YEAR AND NOT AN ID
 * ------------------------
 * `admission_years` is institution-scoped: production holds ELEVEN separate
 * "2026" rows, one per college, out of 79 rows total. Filtering the Learners
 * Profiles list by a single row id would therefore silently narrow the result
 * to one institution — invisible when the list is in "All Institutions" mode,
 * which is the default for anyone who can reach more than one.
 *
 * So the filter travels as the integer year (`?admission_year=2026`) and this
 * function fans it out to every matching row the caller is allowed to see.
 *
 * WHY IT TAKES THE CLIENT AS A PARAMETER
 * --------------------------------------
 * Two callers, two clients, one predicate:
 *   - app/(routes)/learners/profiles/_data/get-learner-profiles.ts — the list
 *     page's request-scoped SERVER client
 *   - LearnerProfileService.getLearnerProfiles — the BROWSER singleton, which
 *     backs the export dialog
 * `LookupService` cannot be reused here: it hardcodes createClientSupabaseClient()
 * and is browser-only. Those two paths are already documented (in
 * get-learner-profiles.ts) as the place where a filter added to one and not the
 * other makes Export quietly disagree with the table on screen — so the
 * resolution lives in exactly one module.
 *
 * SCOPING
 * -------
 * Deliberately unscoped by institution. RLS on `admission_years` already ANDs
 * `role_has_institution_access(institution_id)`, and the learners query applies
 * its own `institution_id` predicate, so adding a third filter here would be
 * redundant — and would break the multi-institution case it exists to serve.
 */

import { getErrorMessage } from '@/lib/utils';

/**
 * @param supabase a Supabase client — server or browser, caller's choice
 * @param year     calendar admission year, e.g. 2026
 * @returns the ids of every visible admission_years row for that year (<= 11)
 * @throws if the lookup itself fails — an empty array means "no visible rows",
 *         which is a different answer and must not be conflated with a failure
 */
export async function resolveAdmissionYearIds(
  supabase: any,
  year: number
): Promise<string[]> {
  const { data, error } = await supabase
    .from('admission_years')
    .select('id')
    .eq('year', year);

  if (error) {
    // Supabase errors are plain objects, not Error instances — surface the code.
    console.error('[admission-year-filter] Failed to resolve admission year:', {
      year,
      code: error.code,
      message: error.message,
    });
    // Thrown, never coerced to []: a failed lookup and a genuinely empty cohort
    // would otherwise render identically as an empty table.
    throw new Error(
      `Failed to resolve admission year ${year}: ${getErrorMessage(error)}`
    );
  }

  const ids = (data ?? []).map((row: { id: string }) => row.id);

  if (ids.length === 0) {
    // Legitimate (the year has no row the caller may read) but indistinguishable
    // from a bug once it reaches the UI as an empty table, so name it in the log.
    console.warn(
      `[admission-year-filter] admission year ${year} resolved to 0 visible rows; the filtered list will be empty`
    );
  }

  return ids;
}
