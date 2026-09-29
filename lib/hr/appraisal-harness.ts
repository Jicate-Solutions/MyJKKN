/**
 * HR appraisal — checks on the appraisal ITSELF, before anyone trusts it to
 * judge people.
 *
 * An appraisal only earns its cost if it measures something. This module holds
 * the pure arithmetic for four checks the Director approved on 2026-09-29:
 *
 *   1. Blind second rating  — two heads, same evidence, do they land on the
 *      same band? (computeAgreement)
 *   2. Checkable statements — each band broken into short claims a second
 *      person could verify. (resolveBandStatements, parseTickedStatements)
 *   3. Saturation           — if nearly everyone gets the same band in an
 *      area, the appraisal has stopped telling people apart. (computeSaturation)
 *   4. Conditions first     — a Below must first say what the college did not
 *      provide. (conditionsMissing, tallyConditions)
 *
 * What this module deliberately does NOT do: grade, score or rank a person,
 * or connect any rating to cost or pay. Nothing here calls an AI service. The
 * second rating feeds only the agreement report; it never touches the
 * appraisal's outcome.
 *
 * Pure: no React, no Supabase, so every default and every sum is testable.
 */

import {
  APPRAISAL_AREAS,
  RATING_ORDER,
  isAppraisalRating,
  parseRatings,
  type AppraisalArea,
  type AppraisalRating,
  type AppraisalRatingMap,
} from '@/lib/hr/appraisal-ratings';

// ---------------------------------------------------------------------------
// Policy slice and defaults
// ---------------------------------------------------------------------------

/** Per area, per band: the statements a second person could check. */
export type BandStatements = Partial<
  Record<AppraisalArea, Partial<Record<AppraisalRating, string[]>>>
>;

/** The keys of hr.performance_review this module reads. All optional. */
export interface AppraisalHarnessPolicySlice {
  band_statements?: BandStatements;
  conditions_first_on_below?: boolean;
  rater_agreement_min_pct?: number;
  rater_agreement_min_pairs?: number;
  saturation_warn_pct?: number;
  saturation_min_count?: number;
}

/**
 * Below this share of exact agreement between two heads, the appraisal is not
 * measuring consistently. 70% is a common floor for two raters on a
 * three-point scale; a college can move it.
 */
export const DEFAULT_AGREEMENT_MIN_PCT = 70;
/** Fewer pairs than this and a percentage would be noise, so none is shown. */
export const DEFAULT_AGREEMENT_MIN_PAIRS = 5;
/** One band holding this share of an area means the area has stopped sorting. */
export const DEFAULT_SATURATION_WARN_PCT = 80;
/** ...but only once enough people are rated for the share to mean anything. */
export const DEFAULT_SATURATION_MIN_COUNT = 10;

function pct(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback;
}

function count(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

export function agreementMinPct(policy: AppraisalHarnessPolicySlice | null | undefined): number {
  return pct(policy?.rater_agreement_min_pct, DEFAULT_AGREEMENT_MIN_PCT);
}

export function agreementMinPairs(policy: AppraisalHarnessPolicySlice | null | undefined): number {
  return count(policy?.rater_agreement_min_pairs, DEFAULT_AGREEMENT_MIN_PAIRS);
}

export function saturationWarnPct(policy: AppraisalHarnessPolicySlice | null | undefined): number {
  return pct(policy?.saturation_warn_pct, DEFAULT_SATURATION_WARN_PCT);
}

export function saturationMinCount(policy: AppraisalHarnessPolicySlice | null | undefined): number {
  return count(policy?.saturation_min_count, DEFAULT_SATURATION_MIN_COUNT);
}

// ---------------------------------------------------------------------------
// 2. Checkable statements under each band
// ---------------------------------------------------------------------------

/** Field the ticked statements are stored under, in every tier's payload. */
export const STATEMENTS_FIELD = 'statements';

/**
 * The statements configured for one area and band. Absent, damaged or blank
 * entries are dropped, so a missing key means "no statements" and the form
 * behaves exactly as it did before this existed.
 */
export function resolveBandStatements(
  policy: AppraisalHarnessPolicySlice | null | undefined,
  area: AppraisalArea,
  band: AppraisalRating,
): string[] {
  const list = policy?.band_statements?.[area]?.[band];
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const s of list) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** True when the college has written at least one statement anywhere. */
export function hasAnyStatements(policy: AppraisalHarnessPolicySlice | null | undefined): boolean {
  return APPRAISAL_AREAS.some((a) =>
    RATING_ORDER.some((b) => resolveBandStatements(policy, a, b).length > 0),
  );
}

export type TickedStatements = Partial<Record<AppraisalArea, string[]>>;

/**
 * The statements a rater ticked, read back from a tier's payload. The text is
 * stored, not an index, so the record keeps what was ticked even if the
 * college later rewrites its statements.
 */
export function parseTickedStatements(
  payload: Record<string, unknown> | null | undefined,
): TickedStatements {
  const raw = payload?.[STATEMENTS_FIELD];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: TickedStatements = {};
  for (const area of APPRAISAL_AREAS) {
    const v = src[area];
    if (!Array.isArray(v)) continue;
    const list = v.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
    if (list.length > 0) out[area] = list;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Conditions first on a Below
// ---------------------------------------------------------------------------

export type ConditionReason =
  | 'time'
  | 'training'
  | 'equipment'
  | 'role_clarity'
  | 'workload'
  | 'other';

/** Kept in the same order as the database guard's allowed list. */
export const CONDITION_REASONS: readonly ConditionReason[] = [
  'time',
  'training',
  'equipment',
  'role_clarity',
  'workload',
  'other',
];

export const CONDITION_LABELS: Record<ConditionReason, string> = {
  time: 'Time',
  training: 'Training',
  equipment: 'Equipment or materials',
  role_clarity: 'Clarity of role',
  workload: 'Workload',
  other: 'Other',
};

/** Field the answers are stored under, in the head's or second rater's payload. */
export const CONDITIONS_FIELD = 'conditions';

/** A short note, not an essay. Matches the database guard. */
export const CONDITIONS_NOTE_MIN = 10;

export interface ConditionAnswer {
  missing: ConditionReason[];
  note: string;
}

export type ConditionAnswers = Partial<Record<AppraisalArea, ConditionAnswer>>;

export function isConditionReason(v: unknown): v is ConditionReason {
  return typeof v === 'string' && (CONDITION_REASONS as readonly string[]).includes(v);
}

/**
 * On unless a college turns it off. A rule that points the question at the
 * college before the person should not switch itself off because a key is
 * missing — same direction as the Collegiality safeguard.
 */
export function conditionsFirstRequired(
  policy: AppraisalHarnessPolicySlice | null | undefined,
): boolean {
  return policy?.conditions_first_on_below !== false;
}

export function parseConditions(
  payload: Record<string, unknown> | null | undefined,
): ConditionAnswers {
  const raw = payload?.[CONDITIONS_FIELD];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: ConditionAnswers = {};
  for (const area of APPRAISAL_AREAS) {
    const v = src[area];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const missing = Array.isArray(o.missing) ? o.missing.filter(isConditionReason) : [];
    const note = typeof o.note === 'string' ? o.note : '';
    out[area] = { missing, note };
  }
  return out;
}

/** One answer is complete when it names at least one reason and a real note. */
export function conditionAnswered(answer: ConditionAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.missing.length > 0 && answer.note.trim().length >= CONDITIONS_NOTE_MIN;
}

/**
 * The areas rated Below whose "what did the college not provide" question is
 * still unanswered. Empty when the rule is off.
 */
export function conditionsMissing(
  ratings: AppraisalRatingMap,
  answers: ConditionAnswers,
  policy: AppraisalHarnessPolicySlice | null | undefined,
): AppraisalArea[] {
  if (!conditionsFirstRequired(policy)) return [];
  return APPRAISAL_AREAS.filter(
    (a) => ratings[a] === 'below' && !conditionAnswered(answers[a]),
  );
}

/**
 * How often each missing condition was named across a set of payloads, most
 * named first. Counts one per area answer, so a head who named "time" for two
 * areas counts twice — each is a separate thing the college did not provide.
 */
export function tallyConditions(
  payloads: ReadonlyArray<Record<string, unknown> | null | undefined>,
): Array<{ reason: ConditionReason; count: number }> {
  const counts = new Map<ConditionReason, number>();
  for (const p of payloads) {
    const ratings = parseRatings(p, APPRAISAL_AREAS);
    const answers = parseConditions(p);
    for (const area of APPRAISAL_AREAS) {
      // Only answers attached to an actual Below count; a stale answer left on
      // an area that was later re-rated is not a finding.
      if (ratings[area] !== 'below') continue;
      for (const r of answers[area]?.missing ?? []) {
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
    }
  }
  return CONDITION_REASONS.map((reason) => ({ reason, count: counts.get(reason) ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// 1. Agreement between two heads
// ---------------------------------------------------------------------------

export interface RatingPair {
  /** The first head's ratings (supervisor_review_jsonb). */
  first: AppraisalRatingMap;
  /** The blind second rater's ratings. */
  second: AppraisalRatingMap;
}

export interface AreaAgreement {
  area: AppraisalArea;
  /** Pairs where both heads rated this area. */
  pairs: number;
  agree: number;
  /** Exact agreement as a share, 0-100, or null with no pairs. */
  agreePct: number | null;
  /** One said Exceeds and the other Below — the disagreement that matters most. */
  twoBandSplits: number;
}

export type AgreementVerdict =
  | { kind: 'not_enough'; pairs: number; needed: number }
  | { kind: 'inconsistent'; weakAreas: AppraisalArea[]; minPct: number }
  | { kind: 'consistent'; minPct: number };

export interface AgreementReport {
  pairs: number;
  perArea: AreaAgreement[];
  verdict: AgreementVerdict;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Per area: how often two heads reading the same evidence landed on the same
 * band, and how often they landed two bands apart.
 *
 * The verdict is strict on purpose: it fails if ANY area falls below the
 * college's floor, because one area measuring noise is enough to make a
 * promotion decision built on all four unsafe.
 */
export function computeAgreement(
  pairs: readonly RatingPair[],
  policy: AppraisalHarnessPolicySlice | null | undefined,
): AgreementReport {
  const perArea: AreaAgreement[] = APPRAISAL_AREAS.map((area) => {
    let n = 0;
    let agree = 0;
    let splits = 0;
    for (const p of pairs) {
      const a = p.first[area];
      const b = p.second[area];
      if (!isAppraisalRating(a) || !isAppraisalRating(b)) continue;
      n += 1;
      if (a === b) agree += 1;
      else if ((a === 'exceeds' && b === 'below') || (a === 'below' && b === 'exceeds')) {
        splits += 1;
      }
    }
    return {
      area,
      pairs: n,
      agree,
      agreePct: n > 0 ? round1((agree / n) * 100) : null,
      twoBandSplits: splits,
    };
  });

  const minPairs = agreementMinPairs(policy);
  const minPct = agreementMinPct(policy);
  let verdict: AgreementVerdict;
  if (pairs.length < minPairs) {
    verdict = { kind: 'not_enough', pairs: pairs.length, needed: minPairs };
  } else {
    const weakAreas = perArea
      .filter((x) => x.agreePct !== null && x.agreePct < minPct)
      .map((x) => x.area);
    verdict =
      weakAreas.length > 0
        ? { kind: 'inconsistent', weakAreas, minPct }
        : { kind: 'consistent', minPct };
  }
  return { pairs: pairs.length, perArea, verdict };
}

// ---------------------------------------------------------------------------
// 3. Saturation — has an area stopped telling people apart?
// ---------------------------------------------------------------------------

export interface AreaSpread {
  area: AppraisalArea;
  counts: Record<AppraisalRating, number>;
  total: number;
  /** The band most people got, or null with nobody rated. */
  topBand: AppraisalRating | null;
  topPct: number | null;
  warn: boolean;
}

/**
 * Count Exceeds / Meets / Below per area and flag an area where one band holds
 * at least the warning share, once at least the minimum number of people are
 * rated there.
 */
export function computeSaturation(
  ratingSets: readonly AppraisalRatingMap[],
  policy: AppraisalHarnessPolicySlice | null | undefined,
): AreaSpread[] {
  const warnPct = saturationWarnPct(policy);
  const minCount = saturationMinCount(policy);
  return APPRAISAL_AREAS.map((area) => {
    const counts: Record<AppraisalRating, number> = { exceeds: 0, meets: 0, below: 0 };
    for (const r of ratingSets) {
      const v = r[area];
      if (isAppraisalRating(v)) counts[v] += 1;
    }
    const total = counts.exceeds + counts.meets + counts.below;
    let topBand: AppraisalRating | null = null;
    for (const b of RATING_ORDER) {
      if (counts[b] > 0 && (topBand === null || counts[b] > counts[topBand])) topBand = b;
    }
    const topPct = topBand && total > 0 ? round1((counts[topBand] / total) * 100) : null;
    const warn = topPct !== null && total >= minCount && topPct >= warnPct;
    return { area, counts, total, topBand, topPct, warn };
  });
}

/**
 * The ratings an appraisal actually came out with, for the saturation count:
 * the committee's if it has rated every area, otherwise the head's. A person's
 * rating of themselves is not the appraisal's output and is never counted.
 */
export function outcomeRatings(review: {
  supervisor_review_jsonb: Record<string, unknown> | null;
  sedc_review_jsonb: Record<string, unknown> | null;
}): AppraisalRatingMap {
  const sedc = parseRatings(review.sedc_review_jsonb, APPRAISAL_AREAS);
  if (APPRAISAL_AREAS.every((a) => isAppraisalRating(sedc[a]))) return sedc;
  return parseRatings(review.supervisor_review_jsonb, APPRAISAL_AREAS);
}
