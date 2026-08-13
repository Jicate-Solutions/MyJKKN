// app/(routes)/accreditation/_lib/visible-institutions.ts
// ============================================================================
// What the college switcher on a body dashboard is ALLOWED to claim.
//
// Every body dashboard's dropdown opened with a hardcoded row reading
// "Cluster (all 8 colleges)". It said that to everybody — including a
// principal who can see exactly one college. The numbers under it were already
// correct, because `quality_evidence_mappings` IS institution-scoped by RLS, so
// that reader got their own college's evidence sitting under a heading that
// claimed the whole cluster. A full label over a narrow number is worse than
// either half alone: it invites the reader to conclude the cluster is empty.
//
// WHY THE LABEL COULD DRIFT FROM THE DATA IN THE FIRST PLACE
// The list of colleges came from a bare `institutions` read, and that table's
// RLS is a set of PERMISSIVE policies OR'd together — one of which
// ("institutions_select_faculty_hod_principal") hands every institution row to
// faculty/hod/principal unconditionally. So the switcher genuinely was served
// all eight rows for a reader entitled to one. Evidence tables scope; the
// reference table does not. That over-permissive policy is real and is the root
// cause, but tightening it would ripple into every other consumer of
// `institutions`, so it is deliberately NOT touched here. This module stops the
// CLIENT from claiming a scope it does not have; it changes no policy, no
// permission and no grant.
//
// Pure, and in its own module, because importing a page pulls the Supabase
// client in at module scope and that cannot load under vitest — the same reason
// _lib/evidence-scope.ts and _lib/institution-body-scope.ts are shaped this way.
//
// ----------------------------------------------------------------------------
// THE ROW LIST IS BUILT HERE, NOT IN THE JSX
// ----------------------------------------------------------------------------
// `options` is the exact, ordered list of <SelectItem> rows, label text and all.
// The page maps it 1:1 and decides nothing. That is deliberate: a test that
// asserts on a label the page then re-derives proves only that two pieces of
// code agree with each other. Here the string the test reads is the string the
// reader sees.
// ============================================================================

/** The value the aggregate row has always carried. Unchanged so that every
 *  existing `selectedInstitution === 'cluster'` check keeps working. */
export const AGGREGATE_SCOPE = 'cluster';

/**
 * One assessed college — a row of `institutions` that carries an iqac_code.
 *
 * Only `id` and `name` are load-bearing here. The rest are carried through
 * untouched so callers that already render a per-college table (NAAC does) keep
 * the same row without a second read.
 */
export interface AssessedCollege {
  id: string;
  name: string;
  iqac_code?: string | null;
  institution_type?: string | null;
}

/** One row of the switcher. Maps 1:1 onto a <SelectItem value=… >label</…>. */
export interface ScopeOption {
  value: string;
  label: string;
}

export interface VisibleScope {
  /**
   * Label of the aggregate row, or `null` when there is no aggregate row.
   *
   * `null` is load-bearing. A reader entitled to one college must not be
   * offered a "cluster" row at all — leaving it in place and renaming it would
   * tell the same untruth in a quieter voice.
   */
  aggregateLabel: string | null;
  /** Every row to render, in order. */
  options: ScopeOption[];
  /** Initial selection. Always the `value` of one of `options`. */
  defaultSelection: string;
  /** The colleges this reader can actually see, in registry order. */
  visible: AssessedCollege[];
  /** ids of `visible`. */
  visibleIds: string[];
  /**
   * Whether the accessible-institution set was positively read.
   *
   * `false` means the answer is UNKNOWN, which is not the same fact as "this
   * person sees nothing" — so it falls open to the previous behaviour and
   * asserts no count. Same argument as `UNPROVISIONED_SCOPE` next door.
   */
  known: boolean;
}

/** The per-college row text, unchanged from what every body page rendered. */
function collegeLabel(c: AssessedCollege): string {
  return `${c.iqac_code ? `[${c.iqac_code}] ` : ''}${c.name}`;
}

function toOption(c: AssessedCollege): ScopeOption {
  return { value: c.id, label: collegeLabel(c) };
}

/**
 * Decide what the switcher may say.
 *
 * @param assessed   every college the page could offer (iqac-coded rows).
 * @param visibleIds the reader's accessible institution ids — their own campus
 *                   PLUS any `user_institution_access` grants, straight from
 *                   `get_user_accessible_institutions`. NOT a role-name guess.
 * @param accessKnown whether that read actually answered.
 *
 * The count in the label is always `visible.length` — never a literal. If a
 * ninth college is seeded tomorrow the sentence stays true on its own.
 */
export function describeVisibleScope(
  assessed: readonly AssessedCollege[],
  visibleIds: readonly string[],
  accessKnown: boolean,
): VisibleScope {
  const allowed = new Set(visibleIds);
  const visible = assessed.filter((c) => allowed.has(c.id));

  // ---------------------------------------------------------------------
  // Cannot narrow. Behave exactly as before; claim nothing.
  //
  // Three different situations land here and they share one property: we
  // have no trustworthy basis for a number.
  //   - the access read has not answered (or failed);
  //   - the page has no assessed colleges at all, so "all 0 colleges" would
  //     be a sentence about a broken read rather than about a reader;
  //   - the reader's accessible set does not intersect the assessed colleges
  //     at all. That is far more likely a provisioning gap (their campus has
  //     no iqac_code) than a genuine entitlement to nothing, and rendering
  //     "No colleges you can see" over it would be its own false claim — and
  //     would hand the NAAC rollup an empty college list, turning a missing
  //     answer into a measured "0 of 900".
  // ---------------------------------------------------------------------
  if (!accessKnown || assessed.length === 0 || visible.length === 0) {
    const label = 'All colleges';
    return {
      aggregateLabel: label,
      options: [{ value: AGGREGATE_SCOPE, label }, ...assessed.map(toOption)],
      defaultSelection: AGGREGATE_SCOPE,
      visible: [...assessed],
      visibleIds: assessed.map((c) => c.id),
      known: false,
    };
  }

  // Sees the whole cluster (institution_scope='all' — accreditation officer,
  // registrar, CEO, COO, managing director). The count is computed, so this
  // keeps reading "Cluster (all 8 colleges)" today without the 8 being typed.
  if (visible.length === assessed.length) {
    const label =
      visible.length === 1
        ? 'Cluster (1 college)'
        : `Cluster (all ${visible.length} colleges)`;
    return {
      aggregateLabel: label,
      options: [{ value: AGGREGATE_SCOPE, label }, ...visible.map(toOption)],
      defaultSelection: AGGREGATE_SCOPE,
      visible,
      visibleIds: visible.map((c) => c.id),
      known: true,
    };
  }

  // Sees exactly one college (institution_scope='own', no extra grants — hod,
  // principal, vice-principal). No aggregate row: there is nothing to
  // aggregate, and offering one would restate the original untruth.
  if (visible.length === 1) {
    const only = visible[0];
    return {
      aggregateLabel: null,
      options: [{ value: only.id, label: `${only.name} (your college)` }],
      defaultSelection: only.id,
      visible,
      visibleIds: [only.id],
      known: true,
    };
  }

  // Sees some but not all — own campus plus `user_institution_access` grants
  // (44 real users hold this shape today). A count, not a name list: the names
  // are already the rows underneath, and repeating them in the heading makes a
  // long dropdown unreadable without adding a fact.
  const label = `The ${visible.length} colleges you can see`;
  return {
    aggregateLabel: label,
    options: [{ value: AGGREGATE_SCOPE, label }, ...visible.map(toOption)],
    defaultSelection: AGGREGATE_SCOPE,
    visible,
    visibleIds: visible.map((c) => c.id),
    known: true,
  };
}
