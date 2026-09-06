/**
 * Which awarding bodies apply to one institution, and what a screen may
 * conclude from the answer.
 *
 * `/accreditation/manage/owners` showed all ten awarding bodies to every
 * institution, so JKKN College of Engineering was asked to name an accountable
 * person for Dental Council, Pharmacy Council, Nursing Council and
 * teacher-education metrics. That is a WRONG DENOMINATOR, not clutter: seven
 * of the 107 active metrics can never apply to an engineering college, so
 * "0 of 107" is unreachable by construction and that college can never reach
 * 100%.
 *
 * The fix therefore has to sit BETWEEN the read and the count, never between
 * the count and the render. Filtering the visible list while "of 107" stays
 * 107 leaves the unreachable total in place, which is the actual bug.
 *
 * Pure, and in its own module, because importing a page pulls the Supabase
 * client in at module scope and that cannot load under vitest.
 */

/**
 * What we know about one institution's awarding bodies.
 *
 * `unprovisioned` is the load-bearing state: the read failed, so we do not
 * know which bodies apply — and that is NOT the same fact as "no body
 * applies". It stays load-bearing even now that migration 20260816010000 is
 * APPLIED (2026-08-06) and both tables exist on production, because a read
 * can still fail for a viewer RLS denies, and that must not render as "this
 * campus answers to nobody".
 *
 * Collapsing the two would be the worse bug in both directions: filtering to
 * nothing hides 96 real metrics from a college that has them, and it does it
 * silently. So an unknown scope FAILS OPEN to today's behaviour — every body
 * is shown, exactly as before — and only a scope we positively read is allowed
 * to narrow anything.
 */
export type InstitutionBodyScope =
  /** The mapping could not be read. Show everything; claim nothing. */
  | { kind: 'unprovisioned' }
  /** Read successfully. `bodies` may legitimately be empty. */
  | { kind: 'known'; bodies: string[] };

export interface InstitutionBodyRow {
  body_code: string;
  is_active?: boolean | null;
}

/** The scope for an institution whose mapping we could not read. */
export const UNPROVISIONED_SCOPE: InstitutionBodyScope = { kind: 'unprovisioned' };

/**
 * Turn the rows of `institution_accreditation_bodies` into a scope.
 *
 * Inactive rows are dropped here rather than in the query so a caller that
 * already holds every row for a campus (the admin screen does) can reuse this
 * without a second round trip.
 */
export function scopeFromRows(rows: readonly InstitutionBodyRow[]): InstitutionBodyScope {
  const bodies = rows
    .filter((r) => r.is_active !== false)
    .map((r) => r.body_code)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
  return { kind: 'known', bodies: [...new Set(bodies)].sort() };
}

/** True when this body applies. An unknown scope admits every body. */
export function isBodyInScope(scope: InstitutionBodyScope, bodyCode: string): boolean {
  if (scope.kind === 'unprovisioned') return true;
  return scope.bodies.includes(bodyCode);
}

/**
 * True only when we positively know the institution answers to nobody.
 *
 * The four offices/companies map to no body at all, and their screens should
 * say so plainly instead of rendering an empty table or redirecting somewhere
 * generic. An unprovisioned scope is never this — a failed read must not be
 * rendered as a factual claim about a college.
 */
export function appliesToNobody(scope: InstitutionBodyScope): boolean {
  return scope.kind === 'known' && scope.bodies.length === 0;
}

/**
 * Narrow a framework read to the bodies that apply.
 *
 * `sh_accreditation_metrics.metric_type` IS the awarding body — there is no
 * `body_code` column on that table, which is the thing that trips up every
 * first look at this data.
 */
export function filterMetricsToScope<T extends { metric_type: string }>(
  metrics: readonly T[],
  scope: InstitutionBodyScope,
): T[] {
  if (scope.kind === 'unprovisioned') return [...metrics];
  return metrics.filter((m) => scope.bodies.includes(m.metric_type));
}

/**
 * The bodies to offer for an institution, given the bodies that actually carry
 * metrics.
 *
 * A mapped body with ZERO metrics is still returned. All five bodies added on
 * 2026-08-06 (NCAHP, CBSE, MATRIC, ABET, THE) have no metrics defined yet, and
 * hiding them would make the two schools' pages identical to the "nothing
 * applies here" empty state — the same nothing-to-do-here problem in a new
 * coat. They are shown, and the screen says the measures are not defined yet.
 */
export function bodiesForScope(
  scope: InstitutionBodyScope,
  bodiesWithMetrics: readonly string[],
): string[] {
  if (scope.kind === 'unprovisioned') return [...bodiesWithMetrics];
  // `bodiesWithMetrics` arrives already ordered largest-framework-first, so
  // NAAC's 69 lead; the mapped bodies that carry no metrics follow it
  // alphabetically rather than being interleaved into that ordering.
  const withMetrics = bodiesWithMetrics.filter((b) => scope.bodies.includes(b));
  const withoutMetrics = scope.bodies.filter((b) => !withMetrics.includes(b)).sort();
  return [...withMetrics, ...withoutMetrics];
}

/**
 * One sentence a screen can print above a filtered list, so the reader knows a
 * filter is in force and can tell a narrowed list from a short one.
 */
export function scopeSentence(
  scope: InstitutionBodyScope,
  institutionName: string | null,
): string {
  const who = institutionName ?? 'this institution';
  if (scope.kind === 'unprovisioned') {
    return 'Showing every awarding body — which bodies apply to each institution has not been recorded yet.';
  }
  if (scope.bodies.length === 0) {
    return `No awarding body is recorded for ${who}.`;
  }
  const one = scope.bodies.length === 1;
  return `Showing the ${scope.bodies.length} awarding ${one ? 'body' : 'bodies'} that ${
    one ? 'applies' : 'apply'
  } to ${who}: ${scope.bodies.join(', ')}.`;
}
