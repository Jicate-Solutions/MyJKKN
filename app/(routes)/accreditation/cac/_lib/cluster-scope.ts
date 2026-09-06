/**
 * What a cluster council spans, stated so the count and the list agree.
 *
 * `accreditation_committees.member_institution_ids` is a plain `uuid[]`. Nothing
 * in the database de-duplicates it, and nothing guarantees the viewer can read
 * every institution on it — RLS decides that per user, so a roster of 10 can
 * come back with 6 rows resolved. Rendering `roster.length` next to a list of 6
 * names is how a screen quietly lies about scope.
 *
 * So this returns all three numbers at once: the true roster size, the labels
 * that actually resolved, and how many are on the roster but outside what this
 * viewer can see. The page prints the third one rather than hiding it — the same
 * honesty the cluster roster card on the committee detail page settled on
 * (PR #2487).
 *
 * Label shape `[CODE] Name` matches the committees hub (PR #2482) and the detail
 * card (PR #2487) exactly, so the three surfaces read as one body.
 *
 * Pure, and in its own module, because importing the page pulls in the Supabase
 * client at module scope and that cannot load under vitest.
 */

export interface SpanInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
}

export interface ClusterSpan {
  /** Distinct institutions on the roster — the number the page prints. */
  total: number;
  /** `[CODE] Name` for every roster entry the viewer could resolve, by name. */
  labels: string[];
  /** On the roster but not resolvable by this viewer. Never negative. */
  hiddenCount: number;
}

export function institutionLabel(inst: SpanInstitution): string {
  return `${inst.iqac_code ? `[${inst.iqac_code}] ` : ''}${inst.name}`;
}

export function summariseClusterSpan(
  memberInstitutionIds: string[] | null | undefined,
  resolved: SpanInstitution[],
): ClusterSpan {
  const rosterIds = new Set((memberInstitutionIds ?? []).filter(Boolean));

  // Only rows genuinely on the roster count — callers pass a shared institution
  // map, so an unfiltered match would credit institutions the council never named.
  const onRoster = resolved.filter((inst) => rosterIds.has(inst.id));

  // A caller can hand the same institution twice; count identities, not rows.
  const matchedIds = new Set(onRoster.map((inst) => inst.id));

  const labels = Array.from(matchedIds)
    .map((id) => onRoster.find((inst) => inst.id === id)!)
    .map(institutionLabel)
    .sort((a, b) => a.localeCompare(b));

  return {
    total: rosterIds.size,
    labels,
    hiddenCount: Math.max(0, rosterIds.size - matchedIds.size),
  };
}
