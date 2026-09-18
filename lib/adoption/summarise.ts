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
//
// CADENCE (Director, 2026-09-18). Some features are seasonal: a timetable is
// made at a term boundary, learners are promoted in bulk once a term. Judging
// those by a weekly share always reads "dead", which is a lie about the
// feature and would put working tools in front of the Director for retirement.
// So every feature carries a cadence:
//   'weekly' — the default, judged by the weekly share as before.
//   'term'   — judged by "active this term": the share of intended people who
//              did the core action at ANY point in the current term.
// A term feature is NEVER called dead mid-term. It is dead only once the term
// has ENDED and every intended role finished it under the bar.
//
// SKIPPED ON PURPOSE. Not everything that merges is a feature a person adopts:
// a cron job, a public form filled in by people who never sign in, a one-person
// allow-list, a micro-interaction. Those are labelled so the registry stays
// complete and then given a skip reason, which takes them out of every number.
// Counting them either inflates the unmeasured gap or parks them at 0% forever
// looking like dead features — both make the three headlines lie.

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

/** A term feature's why-not question is only worth asking near the end of the
 *  term — before that, "you have not used it" is premature, because the season
 *  it belongs to has not arrived. The database sends the question only inside
 *  this window; the button is disabled on the same rule so the refusal is
 *  visible before the tap. Counted inclusive of the last day, so this is
 *  exactly the last two weeks of term. */
export const TERM_ASK_WINDOW_DAYS = 14;

/** A bridged feature whose last log pull is older than this is stale: its zeros
 *  may be ours, so it is never called dead. Mirrors fn_adoption_ask_why. */
export const STALE_AFTER_DAYS = 7;

export function isStale(group: FeatureGroup, now: Date = new Date()): boolean {
  if (!group.usage_bridged) return false;
  if (!group.usage_synced_at) return true;
  const ageMs = now.getTime() - new Date(group.usage_synced_at).getTime();
  return ageMs > STALE_AFTER_DAYS * 86_400_000;
}

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
  /** true = measured from the usage log (needs a pull); when the last pull is
   *  older than STALE_AFTER_DAYS the feature is stale, never judged dead. */
  usage_bridged?: boolean | null;
  usage_synced_at?: string | null;
  /** How this feature is judged. Absent or unreadable means 'weekly' — the
   *  default that every feature had before cadence existed. */
  cadence?: 'weekly' | 'term' | null;
  /** Intended people who did the core action at any point in the CURRENT term.
   *  Only meaningful for a term feature. */
  term_active?: Numeric;
  pct_term?: Numeric;
  /** The current term's window. The same on every row of every feature, because
   *  there is one current term, not one per feature. */
  term_start?: string | null;
  term_end?: string | null;
  /** Set = the desk decided this one is not worth measuring, and why. Null for
   *  everything the loop actually judges. */
  skip_reason?: string | null;
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
  usage_bridged: boolean;
  usage_synced_at: string | null;
  /** 'weekly' unless the label says otherwise — see the cadence note at the top. */
  cadence: 'weekly' | 'term';
  /** The current term's window, carried up from the rows so the page can name
   *  the term it is judging by. Null when the database sent no term. */
  term_start: string | null;
  term_end: string | null;
  /** Why this one is deliberately not measured, or null if it is. */
  skip_reason: string | null;
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
        usage_bridged: row.usage_bridged === true,
        usage_synced_at: row.usage_synced_at ?? null,
        // Anything that is not the word 'term' is weekly. A missing cadence —
        // an older row, a hand-built test row — must read as the old default,
        // never as "seasonal", which would suspend the dead rule silently.
        cadence: row.cadence === 'term' ? 'term' : 'weekly',
        term_start: row.term_start ?? null,
        term_end: row.term_end ?? null,
        skip_reason: row.skip_reason ?? null,
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

/** Seasonal: judged once a term, never by the week. */
export function isTermFeature(group: FeatureGroup): boolean {
  return group.cadence === 'term';
}

/** Deliberately not measured, with a reason. A blank reason is not a skip —
 *  the database stores NULLIF(btrim(...), ''), so an empty string only reaches
 *  here from a hand-built row, and it must not silently hide a real feature. */
export function isSkipped(group: FeatureGroup): boolean {
  return typeof group.skip_reason === 'string' && group.skip_reason.trim() !== '';
}

/** The ones kept out of the numbers on purpose, for the section that lists
 *  what the desk decided not to measure and why. */
export function skippedGroups(groups: FeatureGroup[]): FeatureGroup[] {
  return (groups ?? []).filter(isSkipped);
}

/** Midnight at the START of the term's last day. A Postgres `date` arrives as
 *  'YYYY-MM-DD' and parses to exactly that. Anything unreadable returns null,
 *  which keeps a term feature alive rather than letting a bad date retire it. */
function termEndDayStart(termEnd: string | null | undefined): number | null {
  if (!termEnd) return null;
  const parsed = new Date(termEnd).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** The instant a term stops running. fn_adoption_term_window sets term_end to
 *  the day BEFORE the next boundary, so the term is still running all through
 *  its last day and only stops at the next midnight. */
function termEndsAt(termEnd: string | null | undefined): number | null {
  const dayStart = termEndDayStart(termEnd);
  if (dayStart === null) return null;
  // A date-only value covers its whole day; a full timestamp is already exact.
  return typeof termEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(termEnd)
    ? dayStart + 86_400_000
    : dayStart;
}

/** Has the current term finished? Mid-term — and whenever no term window is
 *  known — the answer is no, and a term feature is never judged. */
export function hasTermEnded(group: FeatureGroup, now: Date = new Date()): boolean {
  const ends = termEndsAt(group.term_end);
  if (ends === null) return false;
  return now.getTime() >= ends;
}

/** The header over the share column: which number this feature is judged by. */
export function activeShareLabel(group: FeatureGroup): 'Weekly' | 'This term' {
  return isTermFeature(group) ? 'This term' : 'Weekly';
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
 *
 * A TERM feature swaps the weekly bar for the term one and adds a gate: it is
 * never dead mid-term, however low this week reads, because the season it
 * belongs to may not have come round yet. It is judged once, after the term
 * has ended, on the share who used it at any point inside that term.
 */
export function isDeadFeature(group: FeatureGroup, now: Date = new Date()): boolean {
  if (isSkipped(group)) return false; // never measured, so never a verdict
  if (!isOldEnoughToJudge(group, now)) return false;
  if (group.status === 'retired') return false;
  if (!group.usage_wired) return false; // zero use of an unrecorded key is not evidence
  if (isStale(group, now)) return false; // a forgotten pull is not abandonment
  const measured = group.rows.filter((row) => toNumber(row.intended_count) > 0);
  if (measured.length === 0) return false;

  if (isTermFeature(group)) {
    // Mid-term, or no term window at all, is not a verdict — it is a wait.
    if (!hasTermEnded(group, now)) return false;
    return measured.every((row) => toNumber(row.pct_term) < DEAD_WEEKLY_PCT);
  }

  return measured.every((row) => toNumber(row.pct_weekly) < DEAD_WEEKLY_PCT);
}

/** Is the feature ready for the why-not question? Mirrors the RPC's own 14-day
 *  refusal so the button can be disabled before the tap — and, for a term
 *  feature, the RPC's second rule: the question goes out only in the last two
 *  weeks of the term, or after it has ended. Asking a person in week three of
 *  term why they have not made next term's timetable is a question with no
 *  honest answer. */
export function canAskWhy(group: FeatureGroup, now: Date = new Date()): boolean {
  // fn_adoption_ask_why refuses a skipped feature outright ("this feature is
  // skipped on purpose"), so the button is off before the tap, not after.
  if (isSkipped(group)) return false;
  if (daysSinceShipped(group.shipped_at, now) < ASK_WHY_MIN_AGE_DAYS) return false;
  if (!isTermFeature(group)) return true;
  const lastDay = termEndDayStart(group.term_end);
  if (lastDay === null) return false; // no term window known → no window to be inside
  // Mirrors fn_adoption_ask_why exactly: it refuses while
  // `today < term_end - 14`, so the window opens ON the day 14 days out and
  // runs to the end of the term. A tighter window here would grey out a button
  // the database would have accepted.
  return now.getTime() >= lastDay - TERM_ASK_WINDOW_DAYS * 86_400_000;
}

/** The three headline numbers, plus the grouped rows the table renders.
 *
 * `groups` is EVERYTHING, skipped ones included, because the page lists those
 * separately. The three numbers count only what the loop actually judges — a
 * cron job labelled and skipped is not an unmeasured gap and not a dead
 * feature, and counting it as either would make all three headlines lie. */
export function summariseAdoption(
  rows: AdoptionMetricRow[],
  now: Date = new Date()
): AdoptionSummary {
  const groups = groupByFeature(rows);
  const judged = groups.filter((group) => !isSkipped(group));
  return {
    labelled: judged.length,
    measured: judged.filter(isMeasured).length,
    dead: judged.filter((group) => isDeadFeature(group, now)).length,
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
