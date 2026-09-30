// A postgraduate applicant's qualifying degree — the one rule shared by the
// counsellor enquiry form and the learner self-fill link (Director ruling
// 2026-09-30: required for every postgraduate record, old ones included).
// Stored in learners_profiles.previous_degree; the college is last_school.

/** Trim every value and drop blanks; null when nothing is left, so a UG record
 *  never gains an empty object. */
export function cleanPreviousDegree(
  pd: Record<string, string | null | undefined> | null | undefined,
): Record<string, string> | null {
  if (!pd) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pd)) {
    const t = v == null ? '' : String(v).trim();
    if (t !== '') out[k] = t;
  }
  // score_type alone (the form's default) is not information.
  const keys = Object.keys(out).filter((k) => k !== 'score_type');
  return keys.length ? out : null;
}

/**
 * Postgraduate applicants must carry their qualifying degree (Director ruling
 * 2026-09-30, "required for everyone" — old records included). Returns the
 * missing field paths, empty when complete. Entrance exam details stay optional:
 * not every PG programme has one.
 */
export function missingPreviousDegreeFields(values: {
  last_school?: string | null;
  previous_degree?: {
    degree_name?: string | null;
    university?: string | null;
    year_of_passing?: string | null;
    score?: string | null;
  } | null;
}): string[] {
  const blank = (v: unknown) => v == null || String(v).trim() === '';
  const pd = values.previous_degree ?? {};
  const missing: string[] = [];
  if (blank(pd.degree_name)) missing.push('previous_degree.degree_name');
  if (blank(values.last_school)) missing.push('last_school');
  if (blank(pd.university)) missing.push('previous_degree.university');
  if (blank(pd.year_of_passing)) missing.push('previous_degree.year_of_passing');
  if (blank(pd.score)) missing.push('previous_degree.score');
  return missing;
}

