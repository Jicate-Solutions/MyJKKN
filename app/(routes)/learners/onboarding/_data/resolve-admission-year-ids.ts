/**
 * Translate an admission cohort YEAR into the admission_year_id values that
 * represent it.
 *
 * `admission_years` is one row per (institution, year) — cohort 2026 is 7
 * distinct uuids across the institutions on this page — so the onboarding
 * filters key on the integer year and expand it here. Doing the expansion
 * server-side keeps the callers' select strings static, i.e. no `!inner` hint
 * has to be bolted onto the admission_year_obj embed just to filter on it.
 *
 * RLS applies: admission_years SELECT needs `admission.settings.years.view`.
 * A role without it resolves zero ids — the same reason its Admission Year
 * column already renders blank — and the callers deliberately render an EMPTY
 * result rather than an unfiltered one. A table that quietly ignores the
 * cohort the user picked is worse than one that shows nothing.
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
    console.error('[resolveAdmissionYearIds] Query error:', error);
    return [];
  }

  return (data ?? []).map((r: { id: string }) => r.id);
}
