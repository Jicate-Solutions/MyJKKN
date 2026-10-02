// lib/instasolver/suggested-places.ts
// ============================================================================
// Place suggestions from the old InstaSolver site, for the estate office to
// confirm as Resource Management places (/resource-management/suggested-places).
//
// Director ruling (30 Sep – 1 Oct 2026): the place list is built from the old
// InstaSolver site's place names plus MyJKKN's resources; each estate office
// confirms once. Nothing is created without that confirmation.
//
// SOURCE: the local export's clean-places.json, whose `mapping` is
//   "<clean institution> || <lowercased raw location>" -> { site, area, via, rows }
// built by hand-written rules over the old issue_location / issue_details text.
//
// WHAT IS KEPT — AGGREGATE ONLY. The output is exactly
//   { institution, place, report_count }
// per (institution, site, area). The raw typed location (the key's second
// half) is NEVER copied, because free text people typed can contain a name
// ("Dr. X's room"); only the curated site/area labels are. Nothing else from
// the export — no names, emails, phone numbers or user ids — reaches the
// output, and the test pins the key set.
// ============================================================================

export interface SuggestedPlace {
  /** The old site's clean college label, e.g. "Dental College & Hospital". */
  institution: string;
  /** "Classrooms", or "Boys Hostel — Rooms" when the site is not the college itself. */
  place: string;
  /** How many old reports were filed against this place. */
  report_count: number;
}

export interface CleanPlaceMappingValue {
  site?: unknown;
  area?: unknown;
  rows?: unknown;
  [other: string]: unknown;
}

/** Areas that name no real place, and so cannot become one. */
export const EXCLUDED_AREAS = new Set([
  'Unspecified',
  'General',
  'Whole building (no spot given)'
]);
export const EXCLUDED_INSTITUTIONS = new Set(['Not given']);

/** Pure. Aggregates the export's mapping into suggestions, most-reported first. */
export function aggregateSuggestedPlaces(
  mapping: Record<string, CleanPlaceMappingValue>
): SuggestedPlace[] {
  const totals = new Map<string, SuggestedPlace>();
  for (const [key, value] of Object.entries(mapping)) {
    const institution = key.split(' || ')[0]?.trim() ?? '';
    const site = typeof value?.site === 'string' ? value.site.trim() : '';
    const area = typeof value?.area === 'string' ? value.area.trim() : '';
    const rows = typeof value?.rows === 'number' && Number.isFinite(value.rows) ? value.rows : 0;
    if (!institution || !site || !area || rows <= 0) continue;
    if (EXCLUDED_INSTITUTIONS.has(institution) || EXCLUDED_AREAS.has(area)) continue;

    const place = site === institution ? area : `${site} — ${area}`;
    const id = `${institution}\u0000${place}`;
    const existing = totals.get(id);
    if (existing) existing.report_count += rows;
    else totals.set(id, { institution, place, report_count: rows });
  }
  return [...totals.values()].sort(
    (a, b) =>
      a.institution.localeCompare(b.institution) ||
      b.report_count - a.report_count ||
      a.place.localeCompare(b.place)
  );
}

/**
 * Old-site college label -> a pattern that finds the same college in
 * MyJKKN's `institutions.name`. Labels with no entry (hostels, Main Office,
 * Jicate, Incubation Cell, transport) belong to no one college; the page lists
 * them separately for the estate office to place under the college it picks.
 */
const INSTITUTION_PATTERNS: Array<[string, RegExp]> = [
  ['Dental College & Hospital', /dental/i],
  ['College of Pharmacy', /pharmacy/i],
  ['Engineering College', /engineering/i],
  ['Arts & Science College', /arts/i],
  ['Nursing College', /nursing/i],
  ['Allied Health Sciences', /allied/i],
  ['College of Education', /education/i],
  ['Matriculation School', /matric/i],
  ['Nattraja Vidhyalaya', /nattraja/i]
];

/** Does this old-site label belong to the MyJKKN college with this name? */
export function labelMatchesInstitution(label: string, institutionName: string): boolean {
  const entry = INSTITUTION_PATTERNS.find(([l]) => l === label);
  return entry ? entry[1].test(institutionName) : false;
}

/** True when the label names one college (so it is not a "shared place"). */
export function isCollegeLabel(label: string): boolean {
  return INSTITUTION_PATTERNS.some(([l]) => l === label);
}

/** Case- and space-insensitive name key, for "does this resource already exist?". */
export function normalisePlaceName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
