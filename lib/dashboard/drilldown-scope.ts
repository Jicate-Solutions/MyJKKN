/**
 * Group Dashboard drill-down — small URL helpers.
 *
 * The destination URLs themselves come from `platform_policies` rows
 * (`dashboard.drilldown.<metric>.destination`) read via
 * `getDashboardDrilldownDestination(...)` — see `lib/policies/get-policy-client.ts`.
 *
 * This file only handles two stateless concerns:
 *   1. Appending the dashboard's currently-selected year + institution scope to
 *      the resolved destination URL so the destination list inherits the
 *      dashboard's filter state.
 *   2. Substituting `:id` placeholders for chart-bar / comparison-row
 *      destinations (deferred per spec §6.2 but the helper is here for the day
 *      the per-institution route lands).
 *
 * Standing rule (CLAUDE.md feedback `feedback_policy_decisions_must_be_config_rows`):
 *   no hardcoded URLs. Every destination flows through the policy reader.
 *
 * B.2 substrate (2026-05-04). See spec
 * `specs/group-dashboard-clickable-drill-downs-spec.md` §3.3.
 */

/**
 * Append the dashboard's year + institution scope to a resolved destination URL.
 *
 * Behavior
 * --------
 * - If the URL already has a query string, params are appended with `&`;
 *   otherwise `?` is used.
 * - `admission_year` is omitted when null.
 * - `institution_ids` is omitted when undefined (super-admin all-access). When
 *   present, joined as a comma-separated list.
 * - Existing query params on the destination URL are preserved (e.g.
 *   `/admission/leads?status=applied` stays `?status=applied&admission_year=...`).
 *
 * @param url        Resolved destination URL (from policy reader)
 * @param year       Selected admission year (program_start_year) or null
 * @param institutionIds Scoped institution IDs or undefined for all-access
 */
export function appendDashboardScope(
  url: string,
  year: number | null,
  institutionIds: string[] | undefined
): string {
  if (!url) return url;

  const sep = url.includes('?') ? '&' : '?';
  const parts: string[] = [];

  if (year !== null && year !== undefined) {
    parts.push(`admission_year=${encodeURIComponent(String(year))}`);
  }
  if (institutionIds && institutionIds.length > 0) {
    parts.push(`institution_ids=${encodeURIComponent(institutionIds.join(','))}`);
  }

  if (parts.length === 0) return url;
  return `${url}${sep}${parts.join('&')}`;
}

/**
 * Replace the `:id` placeholder in a chart-bar / comparison-row destination
 * with the institution UUID. No-op if the URL doesn't contain `:id`.
 */
export function substituteInstitutionId(url: string, institutionId: string): string {
  return url.replace(':id', encodeURIComponent(institutionId));
}
