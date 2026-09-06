// app/(routes)/accreditation/_lib/metric-gap-state.ts
// ============================================================================
// The three things an accreditation screen can truthfully say about a metric,
// and the rule that keeps them apart.
//
// ----------------------------------------------------------------------------
// WHY THIS MODULE EXISTS
// ----------------------------------------------------------------------------
// /accreditation/nirf rendered every metric as `evidenceCounts?.[code] ?? 0`.
// To an assessor a 0 is a MEASUREMENT: we looked, and the answer is none. That
// is a different claim from "the platform does not collect this yet", and it is
// a claim against the college rather than against the platform. The Director's
// second locked decision forbids it — a body that wants data we do not collect
// must see the gap with a named owner, never a zero.
//
// The failure is not that the number was wrong. It is that ONE display was
// carrying TWO facts, so no reader could tell which one they were being told.
//
//   measured         we read the evidence and this is the count. 0 is legal
//                    here and means genuinely none.
//   not-captured     nothing feeds this metric. Say so, name who would own it,
//                    and point at the screen that fixes it — if one exists.
//   not-applicable   this body does not inspect this institution, so the metric
//                    is not a gap at all. See the TODO below: the helper that
//                    DECIDES this ships in PR #2784 and is not duplicated here.
//
// ----------------------------------------------------------------------------
// THE DISTINCTION THAT DOES THE WORK: undefined IS NOT 0
// ----------------------------------------------------------------------------
// The evidence counts arrive as Record<string, number> built by counting rows.
// A metric with no evidence rows has NO KEY — it is `undefined`, not 0. That is
// the whole signal, and `?? 0` destroyed it in one character. So:
//
//   count === undefined  ->  not-captured   (nothing feeds it)
//   count === 0          ->  measured, "0"  (a real, read, empty result)
//   count  >  0          ->  measured
//
// Nothing here may re-introduce a coalesce. The test file asserts that 0 and
// absent produce different output, which is the one regression that would
// silently restore the old behaviour.
//
// ----------------------------------------------------------------------------
// PURE AND DEPENDENCY-FREE ON PURPOSE
// ----------------------------------------------------------------------------
// Importing the page pulls the Supabase browser client in at module scope and
// cannot load under vitest. Same reason iqac/_lib/metric-framework.ts and
// cac/_lib/cac-metric-catalog.ts sit apart from their pages. No React, no
// client, no fetch — inputs in, a display description out.
//
// TODO(#2784): the `not-applicable` state is reachable only by a caller that
// already knows the answer. `app/(routes)/accreditation/_lib/body-applicability.ts`
// — the helper that DERIVES it from institution type and body scope — ships in
// PR #2784 and is not merged at the time of writing. Duplicating its logic here
// would create a second, diverging answer to the same question, which is worse
// than the state being unreachable for now. When #2784 lands, the NIRF page
// passes its verdict through `applicability` and nothing in this file changes.
// ============================================================================

/** What a screen is allowed to say about one metric. */
export type MetricGapState = 'measured' | 'not-captured' | 'not-applicable';

/**
 * The registry row behind a metric's source, as this module reads it.
 *
 * Shape mirrors `public.quality_evidence_source_registry` after migration
 * 20260809100700. Every field a screen needs is NULLABLE, because that
 * migration is Director-gated and the columns may not exist on the database the
 * deployed code is talking to. Absent reads as null, and null renders as a gap
 * with no button — never as a broken link.
 */
export interface EvidenceSourceRoute {
  source_kind: string;
  /** In-app path, or null when no destination could be verified. */
  fix_route: string | null;
  /** One sentence naming the field and the filter, or null. */
  fix_hint: string | null;
  /** custom_roles.role_key hint. Not a permission — never gate on it. */
  owner_role: string | null;
}

/**
 * Who owns the metric, in three states that must NOT be collapsed.
 *
 *   string     a named person is on record
 *   null       we read the ownership register and nobody is assigned
 *   undefined  we could not read it at all
 *
 * The third is not pedantry. `accreditation_metric_owners` is gated on
 * `accreditation.naac.narrative.view`, and an RLS denial in PostgREST returns
 * zero rows with no error — indistinguishable from an empty table. Printing
 * "No owner assigned yet" to someone who simply cannot see the register would
 * assert something we never checked.
 */
export type MetricOwner = string | null | undefined;

export interface MetricGapInput {
  /** The metric's code, e.g. 'RPC_PU'. Carried through for the caller's key. */
  metricCode: string;
  /**
   * Count of evidence rows. **`undefined` means no key was present**, i.e.
   * nothing feeds this metric. Do NOT default this to 0 at the call site.
   */
  count: number | undefined;
  /** Registry row for this metric's source, when the metric has a known one. */
  source?: EvidenceSourceRoute | null;
  /** Owner name, or null for "read, nobody assigned", or undefined for "unread". */
  owner?: MetricOwner;
  /**
   * Set to 'not-applicable' ONLY from a verdict computed elsewhere.
   * See the TODO(#2784) at the top of this file — never derive it here.
   */
  applicability?: 'applicable' | 'not-applicable';
}

export interface MetricGapDisplay {
  metricCode: string;
  state: MetricGapState;
  /** The count, present only when state === 'measured'. */
  count: number | null;
  /** Short label for the badge: the number, or the gap in words. */
  label: string;
  /** The sentence under the label. Empty string when the label says it all. */
  detail: string;
  /** Who to go to. Always a sentence — never an empty owner line. */
  ownerLine: string;
  /** Path for a "Fix this" link, or null when no button may be shown. */
  fixRoute: string | null;
}

const NOT_CAPTURED_LABEL = 'Not captured yet';
const NOT_APPLICABLE_LABEL = 'Does not apply';

/**
 * The one place that decides what a metric's cell says.
 *
 * Every branch is total: there is no fall-through that could reach a bare 0.
 */
export function resolveMetricGap(input: MetricGapInput): MetricGapDisplay {
  const { metricCode, count, source, owner, applicability } = input;

  if (applicability === 'not-applicable') {
    return {
      metricCode,
      state: 'not-applicable',
      count: null,
      label: NOT_APPLICABLE_LABEL,
      detail: 'This body does not inspect this institution, so there is nothing to collect.',
      ownerLine: '',
      fixRoute: null,
    };
  }

  // `undefined` is the signal. A real 0 falls through to measured.
  if (count === undefined) {
    return {
      metricCode,
      state: 'not-captured',
      count: null,
      label: NOT_CAPTURED_LABEL,
      detail: gapDetail(source),
      ownerLine: ownerLine(owner, source),
      // A null route renders NO button. A dead link is worse than no link.
      fixRoute: source?.fix_route ?? null,
    };
  }

  return {
    metricCode,
    state: 'measured',
    count,
    label: String(count),
    detail: '',
    ownerLine: '',
    fixRoute: null,
  };
}

/**
 * The sentence beneath "Not captured yet".
 *
 * `undefined` and `null` are NOT the same answer, for the same reason the owner
 * field distinguishes them:
 *   undefined → the registry has not been read. We know nothing.
 *   null      → the registry WAS read and holds no source for this metric.
 *
 * Collapsing them let a failed network read print "Nothing in the platform
 * feeds this metric yet" — a confident claim about production derived from a
 * request that never answered. That is the same shape as the bug this whole
 * module exists to fix, so it cannot live inside it.
 */
function gapDetail(source?: EvidenceSourceRoute | null): string {
  if (source === undefined) {
    return 'Where to fix this could not be loaded. Reload the page — this is a loading problem, not a sign that nothing feeds this metric.';
  }
  if (source?.fix_hint) return source.fix_hint;
  if (source) {
    // The source is known, but no destination was verified for it — usually a
    // derived snapshot with no screen a person types into.
    return 'This is built from records elsewhere in the platform; there is no single screen to fill it in.';
  }
  return 'Nothing in the platform feeds this metric yet.';
}

/** Who to go to. Never blank, and never an assertion we did not check. */
function ownerLine(owner: MetricOwner, source?: EvidenceSourceRoute | null): string {
  if (typeof owner === 'string' && owner.trim() !== '') {
    return `Owner: ${owner.trim()}`;
  }
  if (owner === null) {
    return source?.owner_role
      ? `No owner assigned yet — usually kept by ${source.owner_role}`
      : 'No owner assigned yet';
  }
  // undefined — we could not read the ownership register at all.
  return source?.owner_role
    ? `Owner not visible to you — usually kept by ${source.owner_role}`
    : 'Owner not visible to you';
}

/**
 * How many of a group of metrics are gaps.
 *
 * Used for the one-line summary above a collapsed list, so a reader does not
 * have to open it to learn there is something inside.
 */
export function countGaps(displays: MetricGapDisplay[]): number {
  // `!== 'measured'` would count a not-applicable metric as a gap — the exact
  // collapse this module exists to prevent, one level up from where it prevents
  // it. A body that does not inspect this institution is not an outstanding
  // task for anyone, and counting it as one puts a number on a screen that no
  // amount of work can ever reduce.
  //
  // Dormant until PR #2784's applicability helper lands and a caller starts
  // passing the third state. Fixed now rather than then, because by then the
  // wrong number would already be on the page.
  return displays.filter((d) => d.state === 'not-captured').length;
}

/**
 * Metrics excluded because no body inspects this institution. Reported
 * separately so a reader can tell "nobody has collected this" from "this was
 * never ours to collect" — two facts that must never share a number.
 */
export function countNotApplicable(displays: MetricGapDisplay[]): number {
  return displays.filter((d) => d.state === 'not-applicable').length;
}

/**
 * Total of the metrics that were actually measured.
 *
 * Deliberately NOT `sum(count ?? 0)`: a group where nothing is captured must
 * total to null so the caller can print the gap, not a zero. This is the same
 * mistake as the per-metric one, one level up.
 */
export function measuredTotal(displays: MetricGapDisplay[]): number | null {
  const measured = displays.filter((d) => d.state === 'measured');
  if (measured.length === 0) return null;
  return measured.reduce((sum, d) => sum + (d.count ?? 0), 0);
}

// ----------------------------------------------------------------------------
// NIRF: which registry source feeds which metric
// ----------------------------------------------------------------------------
// NIRF-specific, and kept beside the renderer so one test file covers both.
//
// A metric appears here ONLY when the source that would fill it is a row in
// `quality_evidence_source_registry`. A plausible-but-wrong destination sends a
// person to a screen that cannot fix their gap, which is worse than sending
// them nowhere — the same standard migration 20260809100200 applied when it
// mapped 4 of 17 metrics and left 13 visibly empty rather than guessing.
//
// PRESENT (6):
//   TLR_FP / TLR_QF / TLR_FE  -> hr_snapshot. All three are blocked by the same
//     root cause recorded in 20260809100200: the team-member records cannot
//     distinguish teaching from non-teaching, and Qualification is set on 178 of
//     857 rows. The fix is typed into the team-member record, which is where
//     hr_snapshot's fix_route points.
//   RPC_PU / RPC_QP           -> sh_publication. Exact source_table match
//     (`sh_publications`), which exists and holds 0 rows.
//   RPC_IP                    -> ip_filing. Exact source_table match
//     (`ip_filings`), which exists and holds 0 rows.
//
// ABSENT, EACH FOR A STATED REASON:
//   TLR_SS / OI_GD / OI_RD / OI_ESCS  fed from `learners_profiles`, which is not
//     a registry source. Migration 20260809100200 maps all four, so they read as
//     measured once it applies.
//   GO_PL / GO_MS   fed from `cdc_placements`. The registry's nearest row is
//     `cdc_drive` -> `cdc_drives`, a DIFFERENT table. Registering the placement
//     table is its own decision, not a guess to smuggle in here.
//   GO_PS           fed from `ss_alumni_tracking`. The registry's
//     `learner_exit_outcome` points at `alumni_outcomes` — also a different
//     table, and JKKN has two alumni stores. Guessing which one an assessor
//     would accept is exactly the error this file exists to prevent.
//   GO_GUE          fed from `ss_graduation_evaluations`. `coe_result_snapshot`
//     looks adjacent but mirrors pass percentage from a different application,
//     and it carries no destination for that reason.
//   RPC_FR          fed from `sh_solutions`. Whether consultancy belongs in
//     NIRF's research footprint is an IQAC judgement, not a routing decision.
//   TLR_FS          no source anywhere. The fee tables record income, which is a
//     different quantity.
//   PR_PEER         NIRF sources peer perception from its OWN survey. JKKN
//     cannot hold this at all, and there is no screen that could ever fill it.
//     It is the clearest candidate for the not-applicable state once the
//     TODO(#2784) helper lands — until then it reads as an honest gap.
// ----------------------------------------------------------------------------
export const NIRF_METRIC_SOURCE_KIND: Readonly<Record<string, string>> = Object.freeze({
  TLR_FP: 'hr_snapshot',
  TLR_QF: 'hr_snapshot',
  TLR_FE: 'hr_snapshot',
  RPC_PU: 'sh_publication',
  RPC_QP: 'sh_publication',
  RPC_IP: 'ip_filing',
});

/** The registry row for a NIRF metric, or null when none is mapped. */
export function nirfSourceFor(
  metricCode: string,
  registry: Record<string, EvidenceSourceRoute>,
): EvidenceSourceRoute | null {
  const kind = NIRF_METRIC_SOURCE_KIND[metricCode.toUpperCase()];
  if (!kind) return null;
  return registry[kind] ?? null;
}
