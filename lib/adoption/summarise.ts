// lib/adoption/summarise.ts
//
// Adoption loop — the headline arithmetic, as pure functions.
//
// fn_adoption_metrics returns ONE ROW PER FEATURE × INTENDED ROLE. A feature
// meant for two roles comes back twice, with its own intended/weekly/ever
// counts each time. Every number on the two adoption pages is derived from
// that shape, so the derivation lives here — testable without a database,
// and identical on the super-admin page and the principal's page.
//
// Three numbers matter (adoption loop, ruling 1):
//   labelled  — how many features have been labelled at all
//   measured  — how many of those actually have intended people to measure
//   dead      — how many are old enough to judge and are still near-zero
//
// "Near-zero" is a WEEKLY share, never an all-time one: a feature used once
// in March by everyone and never again is dead, and pct_ever would hide that.

/** The one app-wide line (daily sign-ins). It is not a feature to adopt, so it
 *  never appears in the three numbers. fn_adoption_metrics already filters it
 *  out; this constant repeats the exclusion here so the arithmetic is correct
 *  on any row set, including one hand-built in a test. */
export const APP_WIDE_FEATURE_KEY = 'app.login';

/** How old a feature must be before a low share means anything. Below this a
 *  zero is just newness — the rollout has not happened yet. */
export const DEAD_AFTER_DAYS = 28;

/** The one bar. Under this weekly share, for every intended role, the feature
 *  is not being used. */
export const DEAD_WEEKLY_PCT = 5;

/** fn_adoption_ask_why refuses a feature younger than this (it answers
 *  {success:false}). The button is disabled at the same age so the refusal is
 *  visible before the tap, not after. */
export const ASK_WHY_MIN_AGE_DAYS = 14;

/** Postgres `numeric` and `bigint` may arrive as a JSON number or, depending on
 *  the driver, as a string. Every count is read through toNumber. */
export type Numeric = number | string | null | undefined;

/** One row of fn_adoption_metrics: a feature as seen by ONE intended role. */
export interface AdoptionMetricRow {
  feature_key: string;
  title: string;
  module: string | null;
  core_action: string;
  shipped_at: string;
  status: string;
  source_pr: number | null;
  /** A role key from custom_roles, or 'all' for every signed-in person. */
  role: string | null;
  intended_count: Numeric;
  weekly_active: Numeric;
  ever_active: Numeric;
  pct_weekly: Numeric;
  pct_ever: Numeric;
  asked_count: Numeric;
  /** answer text → how many people chose it. {} until anyone answers. */
  answers: Record<string, Numeric> | null;
  week_start: string | null;
  /** false = nothing records this key yet: labelled, NOT measured, never dead. */
  usage_wired?: boolean | null;
}

/** One feature with every role row that belongs to it. */
export interface FeatureGroup {
  feature_key: string;
  title: string;
  module: string | null;
  core_action: string;
  shipped_at: string;
  status: string;
  source_pr: number | null;
  asked_count: number;
  answers: Record<string, number>;
  /** Something records this key (a route calls fn_feature_used, or the usage-log bridge). */
  usage_wired: boolean;
  rows: AdoptionMetricRow[];
}

export interface AdoptionSummary {
  labelled: number;
  measured: number;
  dead: number;
  groups: FeatureGroup[];
}

/** Coerce a count to a finite number. Anything unreadable becomes 0 — a
 *  headline number must never render as NaN. */
export function toNumber(value: Numeric): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Whole days between a ship date and `now`. Negative (a future ship date)
 *  clamps to 0, so a mis-typed date can never read as old enough to judge. */
export function daysSinceShipped(shippedAt: string, now: Date = new Date()): number {
  const shipped = new Date(shippedAt).getTime();
  if (!Number.isFinite(shipped)) return 0;
  const elapsed = now.getTime() - shipped;
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

/** Rows that count toward the three numbers: everything except the app-wide
 *  sign-in line and anything missing a feature key. */
export function measurableRows(rows: AdoptionMetricRow[]): AdoptionMetricRow[] {
  return (rows ?? []).filter(
    (row) => Boolean(row?.feature_key) && row.feature_key !== APP_WIDE_FEATURE_KEY
  );
}

/** Collapse the per-role rows into one entry per feature, keeping the order the
 *  database returned them in (newest shipped first). */
export function groupByFeature(rows: AdoptionMetricRow[]): FeatureGroup[] {
  const groups = new Map<string, FeatureGroup>();

  for (const row of measurableRows(rows)) {
    let group = groups.get(row.feature_key);
    if (!group) {
      const answers: Record<string, number> = {};
      for (const [option, count] of Object.entries(row.answers ?? {})) {
        answers[option] = toNumber(count);
      }
      group = {
        feature_key: row.feature_key,
        title: row.title,
        module: row.module,
        core_action: row.core_action,
        shipped_at: row.shipped_at,
        status: row.status,
        usage_wired: row.usage_wired === true,
        source_pr: row.source_pr,
        // asked_count and answers are per FEATURE, not per role — the RPC
        // repeats the same value on every role row, so the first one is it.
        asked_count: toNumber(row.asked_count),
        answers,
        rows: [],
      };
      groups.set(row.feature_key, group);
    }
    group.rows.push(row);
  }

  return Array.from(groups.values());
}

/** Does this feature have anyone to measure? A feature nobody is intended to
 *  use produces a 0% that means "unmeasurable", not "unused". */
export function isMeasured(group: FeatureGroup): boolean {
  // Measured = something records the key AND somebody is intended to use it.
  return group.usage_wired && group.rows.some((row) => toNumber(row.intended_count) > 0);
}

/** Old enough for a low share to be a verdict rather than newness. */
export function isOldEnoughToJudge(group: FeatureGroup, now: Date = new Date()): boolean {
  return daysSinceShipped(group.shipped_at, now) >= DEAD_AFTER_DAYS;
}

/**
 * Dead: shipped at least DEAD_AFTER_DAYS ago, MEASURED (somebody is intended
 * to use it), not already retired, and every intended role is under the bar
 * this week. One role above the bar keeps the feature alive — it is working
 * for somebody, and the answer is targeting, not retirement.
 *
 * Two things are deliberately NOT dead: a feature with nobody intended (it is
 * "not measured" — a labelling gap, shown by the `measured` headline, not a
 * retirement question), and a feature the Director already retired (the
 * decision was taken; counting it again would nag him about his own call).
 */
export function isDeadFeature(group: FeatureGroup, now: Date = new Date()): boolean {
  if (!isOldEnoughToJudge(group, now)) return false;
  if (group.status === 'retired') return false;
  if (!group.usage_wired) return false; // zero use of an unrecorded key is not evidence
  const measured = group.rows.filter((row) => toNumber(row.intended_count) > 0);
  if (measured.length === 0) return false;
  return measured.every((row) => toNumber(row.pct_weekly) < DEAD_WEEKLY_PCT);
}

/** Is the feature old enough for the why-not question? Mirrors the RPC's own
 *  14-day refusal so the button can be disabled before the tap. */
export function canAskWhy(group: FeatureGroup, now: Date = new Date()): boolean {
  return daysSinceShipped(group.shipped_at, now) >= ASK_WHY_MIN_AGE_DAYS;
}

/** The three headline numbers, plus the grouped rows the table renders. */
export function summariseAdoption(
  rows: AdoptionMetricRow[],
  now: Date = new Date()
): AdoptionSummary {
  const groups = groupByFeature(rows);
  return {
    labelled: groups.length,
    measured: groups.filter(isMeasured).length,
    dead: groups.filter((group) => isDeadFeature(group, now)).length,
    groups,
  };
}

/** "12 days ago" / "today" — the age line beside a ship date. */
export function shippedAgo(shippedAt: string, now: Date = new Date()): string {
  const days = daysSinceShipped(shippedAt, now);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
