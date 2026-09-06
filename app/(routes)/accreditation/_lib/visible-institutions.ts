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
//
// ----------------------------------------------------------------------------
// "I COULD NOT READ YOUR ACCESS" IS NOT "YOU CAN SEE NOTHING"
// ----------------------------------------------------------------------------
// Those are different claims and they had one branch, which reintroduced the
// original bug for the people it hurt most. 1,070 production profiles belong to
// an institution with no iqac_code — Jicate Solutions, JKKN Main Office, the
// Matric and CBSE schools, the Testing institution, Nattraja Incubation Forum.
// Their access set reads cleanly and holds exactly one campus, and that campus
// is not assessed. They were being handed "All colleges" and all eight rows as
// selectable options: a bigger untruth than the "Cluster (all 8 colleges)" this
// module exists to delete, told to a specific, identifiable, thousand-person
// population.
//
// `VisibleScopeState` splits them. An unread scope claims nothing; a known-empty
// scope says so plainly and offers no college the reader cannot open.
// ============================================================================

/** The value the aggregate row has always carried. Unchanged so that every
 *  existing `selectedInstitution === 'cluster'` check keeps working. */
export const AGGREGATE_SCOPE = 'cluster';

/**
 * The `value` carried by the single row shown to a reader who can see no
 * assessed college. Deliberately NOT a uuid and NOT `AGGREGATE_SCOPE`: it must
 * never be mistaken for a college id, and it must never silently select the
 * cluster. A page that receives it has nothing to show and must say so.
 */
export const NO_VISIBLE_SCOPE = 'no-visible-college';

/**
 * The sentence shown when the reader positively has no assessed college.
 *
 * Exported so the test asserts the string the reader sees rather than a copy
 * of it, and so a page can print the same words outside the dropdown.
 */
export const NO_VISIBLE_LABEL = 'No accredited college in your access';

/**
 * What we know about this reader's scope. The three values are three DIFFERENT
 * facts and must never share a branch — that conflation is the bug this type
 * exists to make unrepresentable.
 *
 *  - `unread`       — the access read has not answered, or the assessed-college
 *                     registry came back empty. We do not know. Fail open on
 *                     behaviour, claim nothing in the label.
 *  - `none-visible` — we read the access set and it contains no assessed
 *                     college. A fact about the reader, and one we may state.
 *  - `known`        — we read it and it contains at least one.
 *
 * Same shape and same reasoning as `InstitutionBodyScope` next door, where
 * `unprovisioned` is likewise never allowed to render as a claim.
 */
export type VisibleScopeState = 'unread' | 'none-visible' | 'known';

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
   * Which of the three facts we hold. Branch on this, not on `visible.length`:
   * an empty `visible` means two opposite things depending on `state`, and
   * reading the length alone is exactly how the two got conflated before.
   */
  state: VisibleScopeState;
  /**
   * Whether the accessible-institution set was positively read.
   *
   * `false` means the answer is UNKNOWN, which is not the same fact as "this
   * person sees nothing" — so it falls open to the previous behaviour and
   * asserts no count. Same argument as `UNPROVISIONED_SCOPE` next door.
   *
   * `true` for `none-visible`: we DID read it. Kept as a separate boolean
   * because it answers "may this screen state a fact about the reader?", which
   * is true in both `none-visible` and `known` and is the question callers
   * actually ask.
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
 *
 * Returns one of four shapes, in this order: unread, known-empty, whole
 * cluster, one college, some. The first two both carry an empty or full list
 * for opposite reasons, so callers branch on `state` and never on a length.
 */
export function describeVisibleScope(
  assessed: readonly AssessedCollege[],
  visibleIds: readonly string[],
  accessKnown: boolean,
): VisibleScope {
  const allowed = new Set(visibleIds);
  const visible = assessed.filter((c) => allowed.has(c.id));

  // ---------------------------------------------------------------------
  // UNREAD. We do not know this reader's scope, so we may not describe it.
  //
  // Two situations, and they share the property that matters: the missing
  // answer is about a READ, not about a person.
  //   - the access read has not answered (or failed);
  //   - the assessed-college registry came back empty, so "all 0 colleges"
  //     would be a sentence about a broken read rather than about a reader.
  //     Note this case cannot be told apart from "no college has an iqac_code
  //     yet", so it stays open here too.
  //
  // Fail OPEN on behaviour — the full list, exactly as before — and CLOSED on
  // the claim. The label therefore names what the LIST contains and admits the
  // access was not confirmed; it asserts no entitlement and carries no count.
  // 'All colleges' on its own read as a statement about the reader, which is
  // the one thing we cannot make here.
  // ---------------------------------------------------------------------
  if (!accessKnown || assessed.length === 0) {
    const label = 'All colleges (access not confirmed)';
    return {
      aggregateLabel: label,
      options: [{ value: AGGREGATE_SCOPE, label }, ...assessed.map(toOption)],
      defaultSelection: AGGREGATE_SCOPE,
      visible: [...assessed],
      visibleIds: assessed.map((c) => c.id),
      state: 'unread',
      known: false,
    };
  }

  // ---------------------------------------------------------------------
  // KNOWN-EMPTY. We read the access set, and none of the assessed colleges is
  // in it. On production 1,070 profiles sit here: every account whose campus
  // carries no iqac_code — Jicate Solutions, JKKN Main Office, the Matric and
  // CBSE schools, the Testing institution, Nattraja Incubation Forum. Their
  // accessible set is a real, positively-read answer of exactly one campus,
  // and that campus is not assessed.
  //
  // This used to share the branch above, so those 1,070 read "All colleges"
  // over a dropdown offering all eight — a larger untruth than the hardcoded
  // "Cluster (all 8 colleges)" this module was written to delete, and asserted
  // to a specific, identifiable population rather than to an unlucky few.
  //
  // So: no aggregate row (there is nothing to aggregate), and no college rows
  // (listing colleges the reader cannot open is the original bug wearing a
  // different hat). One row, stating the fact.
  //
  // `visible` is empty and that is now a FACT, not a gap — but an empty college
  // list still drives every rollup on these pages to nought, and a nought under
  // "of 900" reads as a measured score of zero. `metric-framework.ts`
  // measurementState() refuses that trade explicitly, so the pages branch on
  // `state === 'none-visible'` and print this sentence INSTEAD OF the numbers.
  // Nothing is measured here, so nothing may be shown as measured.
  // ---------------------------------------------------------------------
  if (visible.length === 0) {
    return {
      aggregateLabel: null,
      options: [{ value: NO_VISIBLE_SCOPE, label: NO_VISIBLE_LABEL }],
      defaultSelection: NO_VISIBLE_SCOPE,
      visible: [],
      visibleIds: [],
      state: 'none-visible',
      known: true,
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
      state: 'known',
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
      state: 'known',
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
    state: 'known',
    known: true,
  };
}
