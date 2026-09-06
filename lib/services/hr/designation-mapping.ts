// lib/services/hr/designation-mapping.ts
// ============================================================================
// Sorting free-text job titles into the four groups JKKN already has.
//
// PURE MODULE — no database client, no React, no I/O. Everything here is a
// function of its arguments so it can be unit-tested directly
// (__tests__/hr/designation-mapping.test.ts).
//
// Context. `staff.designation` is free text with no foreign key (150 distinct
// values over 857 rows, live 2026-08-03). `hr_designations` (187 rows) already
// carries `cadre_id`, and `hr_cadres` already holds exactly the four groups —
// Teaching / Administrative / Non-Technical / Supporting (Technical). The link
// from a person to their designation is `hr_staff_details.designation_id`,
// which already exists and is already read by payroll (PR #2664).
//
// No new vocabulary is introduced here. This module only resolves the existing
// one.
// ============================================================================

/** The one cadre name that means "this person teaches". Matches hr_cadres.name. */
export const TEACHING_CADRE_NAME = 'Teaching';

/**
 * Normalise a job title for comparison.
 *
 * Mirrors the SQL used by the backfill EXACTLY — `btrim(lower(x))`. Postgres
 * `btrim/1` strips spaces only (not tabs or newlines), so this deliberately
 * does NOT use String.prototype.trim(), which strips all whitespace and would
 * make the screen disagree with the migration on a title like "Lecturer\t".
 *
 * Case variants collapse here: 'Assistant Professor' and 'ASSISTANT PROFESSOR'
 * both normalise to 'assistant professor', so they are ONE title.
 */
export function normalizeDesignationKey(raw: string | null | undefined): string {
  if (raw == null) return '';
  let s = String(raw).toLowerCase();
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === ' ') start += 1;
  while (end > start && s[end - 1] === ' ') end -= 1;
  s = s.slice(start, end);
  return s;
}

// ---------------------------------------------------------------------------
// Exact matching
// ---------------------------------------------------------------------------

export interface DesignationOption {
  id: string;
  name: string;
  cadre_id: string | null;
  cadre_name: string | null;
}

/**
 * Resolve a free-text job title to exactly one designation, or null.
 *
 * EXACT normalised equality only. No fuzzy matching, no prefix matching, no
 * "closest" guess: 'Assistant Professor' and 'Associate Professor' are one
 * character apart in spelling and worlds apart in meaning, and
 * 'Assistant Professor' is a prefix of 'Assistant Professor & Head' — a
 * different job. A title that does not match is left unsorted for a human.
 *
 * Returns null when two or more designations share a normalised name, because
 * an ambiguous match is not a match.
 */
export function matchDesignationExact(
  designationText: string | null | undefined,
  options: readonly DesignationOption[]
): DesignationOption | null {
  const key = normalizeDesignationKey(designationText);
  if (key === '') return null;
  const hits = options.filter((o) => normalizeDesignationKey(o.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

// ---------------------------------------------------------------------------
// Teaching rule
// ---------------------------------------------------------------------------

export type CadreClassification = 'teaching' | 'non_teaching' | 'not_sorted';

export interface StaffCadreInput {
  /** hr_staff_details.designation_id — null when nobody has sorted this person yet. */
  designation_id?: string | null;
  /** hr_cadres.name reached through the designation's cadre_id. */
  cadre_name?: string | null;
  /**
   * hr_designations.is_management — the title also carries administrative duty
   * (Head, Principal, Dean). Director decision 6 (2026-08-03): this NEVER
   * demotes a teaching person out of Teaching.
   */
  is_management?: boolean | null;
}

/**
 * Which of the four groups this person belongs to, in the only three answers
 * that are honest: teaching, not teaching, or nobody has sorted them yet.
 *
 * 'not_sorted' is a first-class answer. Today every one of the 857 staff rows
 * carries role_type='teacher' — including Bus Driver and Attender — precisely
 * because an unknown was once defaulted to teaching. This never guesses.
 */
export function classifyStaffCadre(row: StaffCadreInput | null | undefined): CadreClassification {
  if (!row) return 'not_sorted';
  if (!row.designation_id) return 'not_sorted';
  const cadre = normalizeDesignationKey(row.cadre_name);
  if (cadre === '') return 'not_sorted';
  // Director decision 6, 2026-08-03: if ANY part of the role teaches, the
  // person is teaching staff. A Teaching-cadre designation flagged
  // is_management (e.g. 'Assistant Professor & Head') stays teaching.
  return cadre === normalizeDesignationKey(TEACHING_CADRE_NAME) ? 'teaching' : 'non_teaching';
}

/**
 * Does this person count as teaching staff?
 *
 * An unsorted person is NOT counted. Over-counting faculty is the harm that
 * matters for the three blocked NIRF metrics, so the unknown falls outside the
 * numerator rather than inside it. Use `isStaffCadreSorted` to keep unsorted
 * people out of a denominator too.
 */
export function isTeachingStaff(row: StaffCadreInput | null | undefined): boolean {
  return classifyStaffCadre(row) === 'teaching';
}

/** Has anyone sorted this person into a group yet? */
export function isStaffCadreSorted(row: StaffCadreInput | null | undefined): boolean {
  return classifyStaffCadre(row) !== 'not_sorted';
}

// ---------------------------------------------------------------------------
// Title rollup for the mapping screen
// ---------------------------------------------------------------------------

export interface StaffTitleInput {
  id: string;
  designation: string | null;
  /** hr_staff_details.designation_id for this person, when a row exists. */
  designation_id?: string | null;
}

export interface TitleRow {
  /** Normalised comparison key — the identity of the title. */
  key: string;
  /** Human label: the spelling the most people actually carry. */
  label: string;
  /** Every raw spelling that collapses into this title. */
  variants: string[];
  /** How many team members carry this title. */
  headcount: number;
  /** How many of them already have a designation_id. */
  sortedCount: number;
  /** The designation they are sorted to, when all of them agree. */
  designationId: string | null;
}

/**
 * Roll 857 staff rows up into one row per distinct job title, biggest first.
 *
 * Case variants are the SAME title: 'Assistant Professor' and
 * 'ASSISTANT PROFESSOR' become one row whose headcount is their sum, so
 * mapping it once maps both.
 */
export function buildTitleRows(staff: readonly StaffTitleInput[]): TitleRow[] {
  const byKey = new Map<
    string,
    { key: string; variants: Map<string, number>; headcount: number; sortedCount: number; ids: Set<string> }
  >();

  for (const person of staff) {
    const key = normalizeDesignationKey(person.designation);
    if (key === '') continue;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, variants: new Map(), headcount: 0, sortedCount: 0, ids: new Set() };
      byKey.set(key, bucket);
    }
    const raw = (person.designation ?? '').trim();
    bucket.variants.set(raw, (bucket.variants.get(raw) ?? 0) + 1);
    bucket.headcount += 1;
    if (person.designation_id) {
      bucket.sortedCount += 1;
      bucket.ids.add(person.designation_id);
    }
  }

  const rows: TitleRow[] = [];
  for (const bucket of byKey.values()) {
    // Label = the spelling most people carry; alphabetical tie-break keeps the
    // screen stable between renders.
    const variants = [...bucket.variants.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    rows.push({
      key: bucket.key,
      label: variants[0]?.[0] ?? bucket.key,
      variants: variants.map(([v]) => v),
      headcount: bucket.headcount,
      sortedCount: bucket.sortedCount,
      // Only claim a designation when every person under the title agrees.
      designationId:
        bucket.ids.size === 1 && bucket.sortedCount === bucket.headcount
          ? [...bucket.ids][0]
          : null,
    });
  }

  // Biggest headcount first — that is where the work pays.
  rows.sort((a, b) => b.headcount - a.headcount || a.key.localeCompare(b.key));
  return rows;
}

/** A title is sorted only when every person carrying it has been sorted. */
export function isTitleSorted(row: TitleRow): boolean {
  return row.headcount > 0 && row.sortedCount === row.headcount;
}

export interface TitleProgress {
  sorted: number;
  total: number;
  /** Plain sentence for the screen. Never a score, never a percentage. */
  label: string;
}

/**
 * Progress, stated honestly as a count of job titles — not a score, not a
 * grade, not a percentage.
 */
export function summariseTitleProgress(rows: readonly TitleRow[]): TitleProgress {
  const total = rows.length;
  const sorted = rows.filter(isTitleSorted).length;
  return { sorted, total, label: `${sorted} of ${total} job titles sorted` };
}

/** Label for a title nobody has sorted yet. Never defaults to Teaching. */
export const NOT_SORTED_LABEL = 'Not sorted yet';
