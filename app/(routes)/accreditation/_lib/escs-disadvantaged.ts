// app/(routes)/accreditation/_lib/escs-disadvantaged.ts
// ============================================================================
// How many of our learners are economically and socially disadvantaged — and
// how much of that answer we actually asked for.
//
// WHAT NIRF ACTUALLY ASKS FOR
// ---------------------------
// The official Ranking Framework for Universities and Colleges (nirfindia.org)
// defines the ESCS parameter as `ESCS = 20 x (N/50)`, where N is the percentage
// of enrolled learners who are economically and socially disadvantaged, averaged
// over the previous three years, against a benchmark of 50%. That is the whole
// of it. The document sets NO income threshold and NO eligibility test — the
// "full tuition fee reimbursement" definition that circulates on ranking blogs
// is not NIRF's, and is deliberately not cited here.
//
// So NIRF hands us N and leaves the definition to us. This module produces the
// inputs to N and stops there: it deliberately does not compute `20 x (N/50)`,
// because a score is a claim about rank and this file only counts people.
//
// THE RULE JKKN DECIDED (Director, 2026-08-03)
// --------------------------------------------
// A learner counts if EITHER applies:
//   (a) `learners_profiles.scholarship_type` names a government scheme —
//       'FIRST GRADUATE', 'PMS SCHOLARSHIP' or '7.5% SCHOLARSHIP'. The State
//       already means-tested these people; the verification is not ours.
//   (b) `learners_profiles.annual_income` is at or below ₹8,00,000.
//
// WHY THE TWO HALVES ARE REPORTED SEPARATELY — THIS IS THE POINT OF THE MODULE
// ----------------------------------------------------------------------------
// Half (a) is government-verified: every learner in it holds a scheme the State
// awarded after its own means test. Half (b) is ours alone — NIRF never asked
// for an income line, so if the combined figure is ever challenged, JKKN has to
// defend the income half by itself.
//
// The income half is also the larger one. Collapsing both into a single number
// would mean that any challenge to it costs us the whole figure and a recompute.
// Keeping them apart means the government-verified half is always available to
// fall back on, already counted.
//
// ⚠️ `scholarshipOnly` and `incomeOnly` are the two halves standing ALONE, not
// two disjoint groups. They overlap — a first-graduate learner from a low-income
// family is in both. NEVER add them together; `either` is the de-duplicated
// union and the only figure that answers "how many learners". The size of the
// overlap, if a screen wants it, is `scholarshipOnly + incomeOnly - either`.
//
// A BLANK IS NOT A "NO"
// ---------------------
// Most learners with no income on file were never asked, not found comfortable.
// Counting them into the denominator as though they had answered would quietly
// report that JKKN checked and they were fine. So `assessed` travels beside the
// counts, and a screen is expected to print it — "4,841 of 7,171 assessed" — so
// the reader can see how much of the population the answer actually covers.
// ============================================================================

import type { ScholarshipType } from '@/lib/constants/learner-dropdown-values';

/**
 * The income ceiling in the JKKN rule, in rupees, inclusive.
 *
 * Chosen by the Director, not by NIRF — NIRF's document names no threshold.
 * This is the number JKKN would have to defend on its own.
 */
export const ESCS_INCOME_CEILING_INR = 800000;

/**
 * The government schemes that make a learner count on their own.
 *
 * Typed as `ScholarshipType` so that renaming a value in the canonical dropdown
 * vocabulary breaks the build here instead of silently dropping this half of the
 * count to zero. `'NOT APPLICABLE'` is a member of that type and is deliberately
 * absent from this list — it is the answer "no scheme", not a scheme.
 */
export const ESCS_GOVERNMENT_SCHEMES: readonly ScholarshipType[] = [
  'FIRST GRADUATE',
  'PMS SCHOLARSHIP',
  '7.5% SCHOLARSHIP',
];

const SCHEME_LOOKUP: ReadonlySet<string> = new Set(ESCS_GOVERNMENT_SCHEMES);

/**
 * `annual_income` is a TEXT column holding free text, so it can contain anything
 * a form or a spreadsheet import put there. Only a bare, unsigned decimal is
 * treated as a number.
 *
 * Deliberately not trimmed and deliberately not lenient: this is the exact
 * predicate the live figures were verified with (`annual_income ~
 * '^[0-9]+(\.[0-9]+)?$'`). Stripping spaces or commas here would admit rows the
 * verified count excluded, and the screen would then disagree with the figure
 * the Director signed off on.
 */
const BARE_NUMBER = /^[0-9]+(\.[0-9]+)?$/;

/** The two columns this count reads. Nothing else about a learner is needed. */
export interface EscsLearnerRow {
  scholarship_type: string | null;
  annual_income: string | null;
}

export interface EscsDisadvantagedCount {
  /**
   * Learners qualifying on the government-scheme half, counted on its own.
   * This is the figure to fall back on if the income half is ever challenged.
   * Overlaps `incomeOnly` — see the module header.
   */
  scholarshipOnly: number;
  /**
   * Learners qualifying on the income half, counted on its own.
   * Overlaps `scholarshipOnly` — see the module header.
   */
  incomeOnly: number;
  /** The union of both halves, each learner counted once. This is NIRF's N. */
  either: number;
  /**
   * Learners whose `annual_income` is a usable number — i.e. how many families
   * we actually have an income answer from. Everyone else was not asked.
   *
   * Note this tracks the income question only. A learner who names a government
   * scheme but has no income on file is counted in `scholarshipOnly` and in
   * `either`, yet is NOT counted here, because the income question is still
   * unanswered for them. That is the intended reading: `assessed` measures how
   * far the collection got, not how confident the count is.
   */
  assessed: number;
  /** Every learner in the rows handed in, answered or not. The denominator. */
  total: number;
}

/** True when the free-text scholarship value names one of the three schemes. */
export function namesGovernmentScheme(value: string | null | undefined): boolean {
  if (!value) return false;
  // Free text: case and stray whitespace vary between form entry and imports.
  // Anything outside the three named schemes — including 'NOT APPLICABLE' and
  // any local coinage — is not a government means test and does not count.
  return SCHEME_LOOKUP.has(value.trim().toUpperCase());
}

/**
 * The income as a number, or `null` when there is no usable answer.
 *
 * `null` covers a missing column, an empty string, and any non-numeric text.
 * An empty string is the important one: 1,346 rows hold one, and it is present
 * enough to pass a NULL check while meaning nothing. It must never arrive at a
 * comparison as 0, which would silently qualify every one of those learners.
 */
export function usableAnnualIncome(value: string | null | undefined): number | null {
  if (value == null) return null;
  if (!BARE_NUMBER.test(value)) return null;
  const parsed = Number(value);
  // Guard the cast rather than trust it: the regex already excludes anything
  // Number() would turn into NaN or Infinity, so a failure here means the two
  // disagree and the safe answer is "we do not have this learner's income".
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The one place the ceiling comparison lives, so the count and the predicate
 * a screen calls can never drift apart.
 */
function isAtOrBelowCeiling(income: number | null): boolean {
  return income !== null && income <= ESCS_INCOME_CEILING_INR;
}

/** True when we have an income answer and it is at or below the ceiling. */
export function qualifiesOnIncome(value: string | null | undefined): boolean {
  return isAtOrBelowCeiling(usableAnnualIncome(value));
}

/**
 * Count the five figures from plain learner rows.
 *
 * Pure — it holds no opinion about which learners it was handed. Scope is the
 * caller's job, and `total` is always exactly the number of rows passed in, so
 * the denominator is whatever population the caller chose. NIRF ranks higher
 * education, so the read that feeds this filters to the colleges carrying an
 * `iqac_code`; handing in schools would inflate every figure at source.
 */
export function countDisadvantagedLearners(
  rows: readonly EscsLearnerRow[],
): EscsDisadvantagedCount {
  let scholarshipOnly = 0;
  let incomeOnly = 0;
  let either = 0;
  let assessed = 0;

  for (const row of rows) {
    const byScheme = namesGovernmentScheme(row.scholarship_type);
    // Parsed once: `assessed` needs to know an answer exists, the income half
    // needs to know what it was.
    const income = usableAnnualIncome(row.annual_income);
    const byIncome = isAtOrBelowCeiling(income);

    if (byScheme) scholarshipOnly += 1;
    if (byIncome) incomeOnly += 1;
    // One learner, one place in the union — qualifying twice is still one person.
    if (byScheme || byIncome) either += 1;
    if (income !== null) assessed += 1;
  }

  return { scholarshipOnly, incomeOnly, either, assessed, total: rows.length };
}

/**
 * A share of the population as a percentage, or `null` when there is nobody to
 * take a share of.
 *
 * `null` rather than 0 on an empty population: a read that returned no rows —
 * because RLS hid them, or a filter matched nothing — has produced no answer,
 * and "0%" is an answer. A screen should print "not available", not a zero.
 */
export function escsPercentage(count: number, total: number): number | null {
  if (total <= 0) return null;
  return (count / total) * 100;
}
