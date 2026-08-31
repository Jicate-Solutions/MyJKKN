// app/(routes)/accreditation/iqac/_lib/collect-once.ts
// ============================================================================
// "Collect once, report many" — stated as one list instead of ten.
//
// The framework list next door groups by awarding body, which is the right
// shape for asking "what does NAAC want". It is the wrong shape for the
// question the IQAC actually owns: *what do we collect, and who does it serve?*
// Under a body-first grouping, one set of course-attainment records appears
// twice — once as NAAC 3.4.3 and once as NBA's own code — and reads as two
// unrelated chores.
//
// Director decision 1, 2026-08-01: when two bodies count the same thing, show
// it ONCE with each body's own count beneath.
//
// WHAT "THE SAME THING" IS, AND WHY IT IS NOT THE METRIC CODE
// -----------------------------------------------------------
// NAAC calls its research metric `3.4.3` and NIRF calls its own `RPC_PU`.
// Grouping by `metric_code` would treat those as unrelated; grouping by body
// would list the underlying records twice. The thing genuinely collected once
// is the SOURCE — the table the evidence was drawn from — so that is the unit
// this module groups on.
//
// Verified live 2026-08-02: `quality_evidence_mappings` holds 212 rows across
// 11 source tables, and exactly one of those tables — `obe_course_attainment_
// rollup`, 46 records — is currently claimed by two bodies at once (NAAC and
// NBA). Every other source serves NAAC alone. That single row of the table
// below is the whole thesis of this design, and it is one row rather than many
// because coverage is the gap, not architecture.
//
// Pure, and in its own module, because importing the page pulls the Supabase
// client in at module scope and that cannot load under vitest.
// ============================================================================

/** One `(source_table, body_code)` pair as returned by the evidence read. */
export interface SourceBodyRow {
  source_table: string;
  body_code: string;
  /** Mapping rows. A source claimed for two metrics of one body counts twice. */
  rows: number | string;
  /** Distinct underlying records. This is the number a person means by "how many". */
  distinct_sources: number | string;
}

export interface BodyClaim {
  bodyCode: string;
  /** Distinct records of this source that this body counts. */
  count: number;
}

export interface CollectedSource {
  sourceTable: string;
  /** Human label. Never a raw table name, even for a source added tomorrow. */
  label: string;
  /** Distinct records held, counted once no matter how many bodies claim them. */
  heldOnce: number;
  /** Each claiming body and its own count, highest first then alphabetical. */
  claims: BodyClaim[];
  /** True when more than one body draws on this source — the point of the page. */
  servesMultipleBodies: boolean;
  /** The line printed beneath the source name. Never empty. */
  sentence: string;
}

// Labels for the sources live in production today, plus the two the NIRF wiring
// is expected to add. A source not listed here still renders as prose via the
// fallback below — a raw `snake_case` identifier on a governance screen reads as
// a leak of the schema, not as information.
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  audit_cycles: 'Internal audit cycles',
  bos_meetings: 'Board of Studies meetings',
  coe_naac_evidence: 'Examination records',
  event_feedback_naac_evidence: 'Event feedback',
  events: 'Events',
  facility_teaching_naac_evidence: 'Teaching facilities',
  hr_naac_evidence: 'Staff records',
  induction_programs: 'Induction programmes',
  mess_menu_recommendations: 'Mess menu reviews',
  obe_course_attainment_rollup: 'Course attainment records',
  scf_ai_suggestions: 'Learner feedback suggestions',
  sh_publications: 'Research papers',
  ip_filings: 'Patents and IP filings',
};

/**
 * `hr_naac_evidence` → "Staff records"; an unmapped `some_new_table` →
 * "Some new table". The fallback strips a trailing `_naac_evidence` first,
 * because a source named after one body reads oddly on a page whose whole
 * argument is that the source serves several.
 */
export function sourceLabel(sourceTable: string): string {
  const known = SOURCE_LABELS[sourceTable];
  if (known) return known;
  const cleaned = sourceTable
    .replace(/_(naac|nirf|nba|pci|dci|inc|ugc|qs|ncte|aicte)_evidence$/i, '')
    .replace(/_rollup$/, '')
    .replace(/_/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const toCount = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Groups the flat `(source, body)` read into one entry per source.
 *
 * `heldOnce` is the MAXIMUM distinct count across the claiming bodies, not the
 * sum: 46 course-attainment records claimed by NAAC and by NBA are 46 records,
 * not 92. Taking the max rather than the sum is what "collect once" means, and
 * summing here is the exact double-count the page exists to end.
 */
export function groupEvidenceBySource(rows: readonly SourceBodyRow[]): CollectedSource[] {
  const bySource = new Map<string, BodyClaim[]>();

  for (const row of rows) {
    if (!row?.source_table || !row?.body_code) continue;
    const claims = bySource.get(row.source_table) ?? [];
    claims.push({ bodyCode: row.body_code, count: toCount(row.distinct_sources) });
    bySource.set(row.source_table, claims);
  }

  const out: CollectedSource[] = [];
  for (const [sourceTable, rawClaims] of bySource) {
    // One body can appear twice if it claims the source for two of its metrics;
    // its count for the source is the larger, never the sum.
    const merged = new Map<string, number>();
    for (const c of rawClaims) {
      merged.set(c.bodyCode, Math.max(merged.get(c.bodyCode) ?? 0, c.count));
    }

    const claims = Array.from(merged, ([bodyCode, count]) => ({ bodyCode, count }))
      .sort((a, b) => b.count - a.count || a.bodyCode.localeCompare(b.bodyCode));

    const heldOnce = claims.reduce((max, c) => Math.max(max, c.count), 0);
    const servesMultipleBodies = claims.length > 1;

    const bodyList = claims.map((c) => `${c.bodyCode} counts ${c.count}`).join(' · ');
    const sentence = servesMultipleBodies
      ? `${heldOnce} held once, serving ${claims.length} bodies — ${bodyList}.`
      : `${heldOnce} held, serving ${claims[0]?.bodyCode ?? 'no body'} only.`;

    out.push({
      sourceTable,
      label: sourceLabel(sourceTable),
      heldOnce,
      claims,
      servesMultipleBodies,
      sentence,
    });
  }

  // Sources serving several bodies first — they are the evidence that the idea
  // works — then by how much is held, then by name so the order is stable.
  return out.sort(
    (a, b) =>
      Number(b.servesMultipleBodies) - Number(a.servesMultipleBodies) ||
      b.heldOnce - a.heldOnce ||
      a.label.localeCompare(b.label),
  );
}

export interface CollectOnceSummary {
  sources: CollectedSource[];
  /** Distinct source tables feeding at least one body. */
  sourcesHeld: number;
  /** Sources already serving more than one body — the working proof. */
  sourcesServingMultipleBodies: number;
  /** Records that would have been collected twice under a per-body regime. */
  entriesSavedByCollectingOnce: number;
}

export function summariseCollectOnce(rows: readonly SourceBodyRow[]): CollectOnceSummary {
  const sources = groupEvidenceBySource(rows);
  return {
    sources,
    sourcesHeld: sources.length,
    sourcesServingMultipleBodies: sources.filter((s) => s.servesMultipleBodies).length,
    // What a per-body regime would have re-collected: every claim past the first.
    entriesSavedByCollectingOnce: sources.reduce(
      (sum, s) => sum + s.heldOnce * Math.max(0, s.claims.length - 1),
      0,
    ),
  };
}

// ---------------------------------------------------------------------------
// The reporting window (Director decision 5)
// ---------------------------------------------------------------------------

/**
 * The academic year label for a given date, in the form the database already
 * uses (`AY 2026-27`, 210 of 212 rows on 2026-08-02).
 *
 * The JKKN academic year opens in June, so January to May belongs to the year
 * that began the previous June. Taking the calendar year instead would file
 * every spring record under the wrong session.
 *
 * Takes the date as an argument rather than reading the clock, so the caller
 * owns the timezone and this stays testable.
 */
export function academicYearLabel(on: Date): string {
  const y = on.getFullYear();
  const startYear = on.getMonth() >= 5 ? y : y - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `AY ${startYear}-${endShort}`;
}

/**
 * The years offered in the selector: every label present in the data, newest
 * first, plus the current year even when nothing has been filed against it yet.
 *
 * Including an empty current year is deliberate. Omitting it would make the
 * page open on last year's numbers in July and look complete, which is the
 * quietest way to under-report a live session.
 */
export function reportingWindows(
  labelsInData: readonly string[],
  today: Date,
): { windows: string[]; defaultWindow: string } {
  const current = academicYearLabel(today);
  const windows = Array.from(new Set([current, ...labelsInData.filter(Boolean)])).sort((a, b) =>
    b.localeCompare(a),
  );
  return { windows, defaultWindow: current };
}

// ---------------------------------------------------------------------------
// "Does not apply" (Director decision 3)
// ---------------------------------------------------------------------------

export interface InspectableInstitution {
  id: string;
  name: string;
  iqac_code: string | null;
}

/**
 * Whether any of the ten awarding bodies inspects this institution.
 *
 * The cluster's 14 institutions include two schools, a main office, an
 * incubation forum, a test tenant and an external company; none of them is
 * inspected by NAAC, NIRF, NBA or the other seven. The eight that are inspected
 * are exactly the eight carrying an `iqac_code`, which is the field that exists
 * precisely to identify them.
 *
 * The distinction matters because "does not apply" and "zero" are different
 * claims. A school showing 0 of 107 metrics answered reads as a school failing
 * an inspection it was never subject to.
 */
export function isInspectedByAccreditationBodies(inst: InspectableInstitution): boolean {
  return Boolean(inst.iqac_code && inst.iqac_code.trim());
}

export function describeApplicability(inst: InspectableInstitution): string {
  return isInspectedByAccreditationBodies(inst)
    ? `Inspected as ${inst.iqac_code}.`
    : 'Does not apply — no awarding body inspects this institution.';
}
