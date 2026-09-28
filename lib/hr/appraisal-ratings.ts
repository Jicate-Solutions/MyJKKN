/**
 * HR Appraisal — the three-rating model (T5.1).
 *
 * One place defines what a staff appraisal rates and how a rating is written
 * down. Every tier of the review chain (staff → dept HoD → SEDC → Director)
 * and the promotion rule read from here, so the areas and the scale cannot
 * drift apart between screens.
 *
 * Why ratings and not a score: a single number invites counting outputs, which
 * penalises work that has no natural unit — most obviously service to the
 * institution. Three bands describe performance without implying a decimal
 * place of precision nobody has.
 *
 * Storage: ratings live inside the existing JSONB payloads on
 * hr_performance_reviews (self_appraisal_jsonb, supervisor_review_jsonb,
 * sedc_review_jsonb). No schema change — those columns are deliberately
 * free-form "while the form catalogue evolves".
 */

// ---------------------------------------------------------------------------
// The scale
// ---------------------------------------------------------------------------

export type AppraisalRating = 'exceeds' | 'meets' | 'below';

/** Best first — the order every picker and legend renders in. */
export const RATING_ORDER: readonly AppraisalRating[] = ['exceeds', 'meets', 'below'];

export const RATING_LABELS: Record<AppraisalRating, string> = {
  exceeds: 'Exceeds expectations',
  meets: 'Meets expectations',
  below: 'Below expectations',
};

/** Compact label for tables and badges, where the full phrase does not fit. */
export const RATING_SHORT: Record<AppraisalRating, string> = {
  exceeds: 'Exceeds',
  meets: 'Meets',
  below: 'Below',
};

export function isAppraisalRating(v: unknown): v is AppraisalRating {
  return v === 'exceeds' || v === 'meets' || v === 'below';
}

// ---------------------------------------------------------------------------
// The areas
// ---------------------------------------------------------------------------

export type AppraisalArea = 'teaching' | 'research' | 'service' | 'collegiality';

/**
 * The four areas, rated on every appraisal at every college. Fixed rather than
 * configurable: a rating only means something if it means the same thing in
 * Engineering as in Dental, and a per-college switch would quietly make two
 * appraisals incomparable.
 */
export const APPRAISAL_AREAS: readonly AppraisalArea[] = [
  'teaching',
  'research',
  'service',
  'collegiality',
];

export const AREA_LABELS: Record<AppraisalArea, string> = {
  teaching: 'Teaching',
  research: 'Research',
  service: 'Service',
  collegiality: 'Collegiality',
};

/**
 * Shown under each area on every form. "Service" is spelled out because
 * elsewhere in this codebase `service` means length of employment
 * (min_service_months_for_review, completed_years_of_service). Here it means
 * work done FOR the institution, and a reviewer must not have to guess.
 */
export const AREA_HELP: Record<AppraisalArea, string> = {
  teaching: 'Classroom and lab teaching, supervision, and student learning.',
  research: 'Research, scholarship, publication, and creative work.',
  service:
    'Work done for the institution — committees, admissions, accreditation, events, ' +
    'departmental duties. This is not length of employment.',
  collegiality:
    'How the person works with colleagues: reliability, sharing load, and conduct ' +
    'towards others.',
};

// ---------------------------------------------------------------------------
// Points — the ONLY arithmetic in the model, and only for ordering promotions
// ---------------------------------------------------------------------------

export interface RatingPoints {
  exceeds: number;
  meets: number;
  below: number;
}

/**
 * Default mapping. Every area counts the same; no area carries a weight,
 * because no weighting has been decided. Promotion needs some ordering between
 * two candidates, and this is the least-assuming one that provides it.
 * Overridable per college via hr.performance_review.rating_points.
 */
export const DEFAULT_RATING_POINTS: RatingPoints = {
  exceeds: 2,
  meets: 1,
  below: 0,
};

// ---------------------------------------------------------------------------
// Policy-driven shape
// ---------------------------------------------------------------------------

/** The slice of hr.performance_review this module reads. */
export interface AppraisalRatingPolicySlice {
  rating_points?: Partial<RatingPoints>;
  /**
   * Require a written example when Collegiality is rated Below.
   * Absent means ON: the safeguard applies unless a college turns it off.
   */
  collegiality_below_requires_example?: boolean;
}

/** The areas to rate. One accessor so no screen builds its own list. */
export function resolveAreas(): AppraisalArea[] {
  return [...APPRAISAL_AREAS];
}

/** Points in force, with any partial override applied over the defaults. */
export function resolveRatingPoints(
  policy: AppraisalRatingPolicySlice | null | undefined,
): RatingPoints {
  const p = policy?.rating_points;
  if (!p) return { ...DEFAULT_RATING_POINTS };
  const pick = (k: keyof RatingPoints) =>
    typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : DEFAULT_RATING_POINTS[k];
  return { exceeds: pick('exceeds'), meets: pick('meets'), below: pick('below') };
}

// ---------------------------------------------------------------------------
// Reading and writing the JSONB payloads
// ---------------------------------------------------------------------------

export type AppraisalRatingMap = Partial<Record<AppraisalArea, AppraisalRating>>;

/**
 * Pull the ratings out of one tier's JSONB payload, keeping only areas this
 * college rates. Anything unrecognised is dropped rather than trusted: these
 * payloads are free-form, and older rows hold a 1-10 number instead.
 */
export function parseRatings(
  payload: Record<string, unknown> | null | undefined,
  areas: readonly AppraisalArea[],
): AppraisalRatingMap {
  const raw = payload?.ratings;
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: AppraisalRatingMap = {};
  for (const area of areas) {
    const v = src[area];
    if (isAppraisalRating(v)) out[area] = v;
  }
  return out;
}

/** Areas still unrated — what a "you must rate every area" check reports. */
export function missingAreas(
  ratings: AppraisalRatingMap,
  areas: readonly AppraisalArea[],
): AppraisalArea[] {
  return areas.filter((a) => !isAppraisalRating(ratings[a]));
}

export function isComplete(
  ratings: AppraisalRatingMap,
  areas: readonly AppraisalArea[],
): boolean {
  return missingAreas(ratings, areas).length === 0;
}

// ---------------------------------------------------------------------------
// Derived score — for promotion ordering only, never shown as the appraisal
// ---------------------------------------------------------------------------

/**
 * Turn a complete set of ratings into the 0-100 number the promotion rule
 * consumes. All areas count equally: the score is the share of the maximum
 * available points that was actually awarded.
 *
 * All areas "Meets" gives 50. All "Exceeds" gives 100. All "Below" gives 0.
 * Returns null when any area is unrated, so an incomplete appraisal can never
 * be stamped with a number that looks decided.
 */
export function deriveAppraisalScore(
  ratings: AppraisalRatingMap,
  areas: readonly AppraisalArea[],
  points: RatingPoints = DEFAULT_RATING_POINTS,
): number | null {
  if (areas.length === 0) return null;
  if (!isComplete(ratings, areas)) return null;

  const best = Math.max(points.exceeds, points.meets, points.below);
  // A flat scale carries no information; refuse to invent a spread.
  if (!Number.isFinite(best) || best <= 0) return 0;

  const earned = areas.reduce((sum, a) => sum + points[ratings[a] as AppraisalRating], 0);
  const score = (earned / (areas.length * best)) * 100;
  return Math.round(score * 100) / 100;
}

/** "2 Exceeds, 1 Meets" — the plain summary shown beside a review row. */
export function summariseRatings(
  ratings: AppraisalRatingMap,
  areas: readonly AppraisalArea[],
): string {
  const counts = RATING_ORDER.map((r) => ({
    r,
    n: areas.filter((a) => ratings[a] === r).length,
  })).filter((x) => x.n > 0);
  if (counts.length === 0) return 'Not rated';
  return counts.map((x) => `${x.n} ${RATING_SHORT[x.r]}`).join(', ');
}

/** True when any area was rated Below — the case a reviewer must not miss. */
export function hasBelow(
  ratings: AppraisalRatingMap,
  areas: readonly AppraisalArea[],
): boolean {
  return areas.some((a) => ratings[a] === 'below');
}

// ---------------------------------------------------------------------------
// Collegiality safeguard
// ---------------------------------------------------------------------------

/**
 * Collegiality is the area most open to being used against someone a reviewer
 * simply dislikes: unlike a class taught or a paper published, it leaves no
 * record of its own. So a Below here has to be accompanied by a written
 * example of the behaviour. The rating is still the reviewer's to give; they
 * just have to say what it is based on.
 *
 * On unless a college turns it off, via
 * hr.performance_review.collegiality_below_requires_example = false.
 */
export function collegialityExampleRequired(
  policy: AppraisalRatingPolicySlice | null | undefined,
): boolean {
  return policy?.collegiality_below_requires_example !== false;
}

/** Field name the example is stored under, in every tier's JSONB payload. */
export const COLLEGIALITY_EXAMPLE_FIELD = 'collegiality_example';

/** Minimum length that counts as an example rather than a shrug. */
export const COLLEGIALITY_EXAMPLE_MIN = 20;

/**
 * Whether this reviewer still owes an example. True only when they rated
 * Collegiality Below, the safeguard is on, and they have not written one.
 */
export function collegialityExampleMissing(
  ratings: AppraisalRatingMap,
  example: string | null | undefined,
  policy: AppraisalRatingPolicySlice | null | undefined,
): boolean {
  if (ratings.collegiality !== 'below') return false;
  if (!collegialityExampleRequired(policy)) return false;
  return (example ?? '').trim().length < COLLEGIALITY_EXAMPLE_MIN;
}

/** Read the example back out of a tier's free-form payload. */
export function parseCollegialityExample(
  payload: Record<string, unknown> | null | undefined,
): string {
  const v = payload?.[COLLEGIALITY_EXAMPLE_FIELD];
  return typeof v === 'string' ? v : '';
}
